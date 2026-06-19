import { Usuario } from '../types';
import { config } from '../config';
import { crearSuscripcion, mpConfigurado, PlanAbakus } from '../pagos/mercadopago';
import { updateUsuario } from '../supabase/queries';
import { clp } from '../utils/format';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADO_ESPERANDO_EMAIL = 'esperando_email';
const ESTADO_ESPERANDO_PLAN = 'esperando_plan';

/**
 * Determina si el usuario tiene acceso para registrar movimientos.
 * Acceso si: tiene plan de pago activo o su prueba gratis sigue vigente.
 *
 * Nota: si trial_ends_at es null (usuarios de n8n o previos a la migración),
 * NO se bloquea — evita dejar fuera a usuarios existentes.
 */
export function accesoVigente(user: Usuario): boolean {
  if (user.plan === 'basico' || user.plan === 'pro' || user.plan === 'premium') return true;
  if (!user.trial_ends_at) return true;
  return new Date(user.trial_ends_at).getTime() > Date.now();
}

/** Mensaje que se envía cuando la prueba gratis terminó y el usuario no es premium. */
export function mensajeTrialVencido(): string {
  const base = `🌟 Tu prueba gratis de Abakus terminó.

Para seguir registrando tus finanzas, activa tu plan escribiendo *suscribirme*.`;

  if (config.pago.mercadopagoLink || mpConfigurado()) {
    return `${base}\n\n¡Sigo aquí para ayudarte! 🧮`;
  }
  return `${base}\n\n(La suscripción se activará muy pronto 🙌)`;
}

/** ¿El usuario está esperando ingresar su email? */
export function esperandoEmail(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO_ESPERANDO_EMAIL;
}

/** ¿El usuario está esperando seleccionar su plan? */
export function esperandoPlan(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO_ESPERANDO_PLAN;
}

/**
 * Inicia la suscripción cuando el usuario escribe "suscribirme".
 * - Si MP por API está configurado: pide email (o usa el guardado) y luego el plan.
 * - Si solo hay link estático: lo envía.
 * - Si nada está configurado: mensaje de "próximamente".
 */
export async function iniciarSuscripcion(user: Usuario): Promise<string> {
  if (mpConfigurado()) {
    if (user.email && EMAIL_RE.test(user.email)) {
      await updateUsuario(user.phone, { estado_conversacion: ESTADO_ESPERANDO_PLAN });
      return mensajeSeleccionPlan();
    }
    await updateUsuario(user.phone, { estado_conversacion: ESTADO_ESPERANDO_EMAIL });
    return '¡Genial que quieras activar tu plan! 🙌\n\nPara generar tu pago seguro, ¿me confirmas tu *correo electrónico*?';
  }

  if (config.pago.mercadopagoLink) {
    return `💳 *Activa tu plan Abakus*\n\nSuscríbete de forma segura con Mercado Pago aquí:\n${config.pago.mercadopagoLink}\n\n¡Gracias por confiar en Abakus! 🧮`;
  }

  return '🚧 La suscripción estará disponible muy pronto. ¡Te avisaré apenas se active! 🙌';
}

/**
 * Procesa el mensaje cuando el usuario está en estado "esperando_email".
 */
export async function procesarEmailSuscripcion(user: Usuario, texto: string): Promise<string> {
  const email = texto.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return 'Mmm, ese correo no parece válido 🤔 ¿Me lo escribes de nuevo? (ej: nombre@gmail.com)';
  }

  await updateUsuario(user.phone, { email, estado_conversacion: ESTADO_ESPERANDO_PLAN });
  return mensajeSeleccionPlan();
}

/**
 * Procesa la selección de plan cuando el usuario está en estado "esperando_plan".
 */
export async function procesarSeleccionPlan(user: Usuario, texto: string): Promise<string> {
  const plan = detectarPlan(texto);

  if (!plan) {
    return `No reconocí tu elección 🤔 Responde *1* para Plan Básico o *2* para Plan Pro.`;
  }

  const email = user.email ?? '';
  const respuesta = await crearYEnviarLink(user.phone, email, plan);
  // Limpiamos el estado solo después de un link generado con éxito.
  await updateUsuario(user.phone, { estado_conversacion: null });
  return respuesta;
}

function detectarPlan(texto: string): PlanAbakus | null {
  const t = texto.trim().toLowerCase();
  if (t === '1' || t === 'básico' || t === 'basico' || t === 'plan básico' || t === 'plan basico') {
    return 'basico';
  }
  if (t === '2' || t === 'pro' || t === 'plan pro') {
    return 'pro';
  }
  return null;
}

/** Descripción informativa de los planes (cuando el usuario pregunta por ellos
 *  sin iniciar el flujo de pago). Nunca afirma que Abakus es gratis. */
export function descripcionPlanes(): string {
  const pb = config.pago.precioBasico > 0 ? ` — ${clp(config.pago.precioBasico)}/mes` : '';
  const pp = config.pago.precioPro > 0 ? ` — ${clp(config.pago.precioPro)}/mes` : '';

  return `🧮 *Planes de Abakus*

1️⃣ *Plan Básico*${pb}
Ingresos y egresos ilimitados · hasta 3 cuentas por cobrar activas · historial de 90 días.

2️⃣ *Plan Pro*${pp} ⭐
Todo lo del Básico + cuentas por cobrar ilimitadas · historial completo · recordatorios automáticos de cobro · reporte Excel exportable.

Para activar tu plan, escribe *suscribirme*.`;
}

function mensajeSeleccionPlan(): string {
  const precioBasico = clp(config.pago.precioBasico);
  const precioPro = clp(config.pago.precioPro);

  return `¡Perfecto! Elige tu plan:

1️⃣ *Plan Básico* — ${precioBasico}/mes
Ingresos y egresos ilimitados. Hasta 3 cuentas por cobrar activas. Historial de 90 días.

2️⃣ *Plan Pro* — ${precioPro}/mes
Todo el Básico + cuentas ilimitadas, historial completo, recordatorios automáticos de cobro y reporte exportable. ⭐

Responde *1* para Básico o *2* para Pro.`;
}

async function crearYEnviarLink(phone: string, email: string, plan: PlanAbakus): Promise<string> {
  const initPoint = await crearSuscripcion(phone, email, plan);
  const nombrePlan = plan === 'pro' ? 'Pro' : 'Básico';
  return `💳 *Activa tu Abakus Plan ${nombrePlan}*

Listo, ${email}. Completa tu suscripción de forma segura aquí:
${initPoint}

Apenas se confirme el pago, tu cuenta queda activa al instante. ¡Gracias por confiar en Abakus! 🧮`;
}
