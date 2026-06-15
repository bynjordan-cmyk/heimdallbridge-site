import { Usuario } from '../types';
import { config } from '../config';
import { crearSuscripcion, mpConfigurado } from '../pagos/mercadopago';
import { updateUsuario } from '../supabase/queries';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADO_ESPERANDO_EMAIL = 'esperando_email';

/**
 * Determina si el usuario tiene acceso para registrar movimientos.
 * Acceso si: es premium (pagó) o su prueba gratis sigue vigente.
 *
 * Nota: si trial_ends_at es null (usuarios de n8n o previos a la migración),
 * NO se bloquea — evita dejar fuera a usuarios existentes.
 */
export function accesoVigente(user: Usuario): boolean {
  if (user.plan === 'premium') return true;
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

/** ¿El usuario está en medio del flujo de suscripción (esperando su email)? */
export function esperandoEmail(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO_ESPERANDO_EMAIL;
}

/**
 * Inicia la suscripción cuando el usuario escribe "suscribirme".
 * - Si MP por API está configurado: pide el email (o usa el guardado) y crea el link.
 * - Si solo hay link estático: lo envía.
 * - Si nada está configurado: mensaje de "próximamente".
 */
export async function iniciarSuscripcion(user: Usuario): Promise<string> {
  if (mpConfigurado()) {
    if (user.email && EMAIL_RE.test(user.email)) {
      return crearYEnviarLink(user.phone, user.email);
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
 * Valida el correo, lo guarda y genera el link de pago.
 */
export async function procesarEmailSuscripcion(user: Usuario, texto: string): Promise<string> {
  const email = texto.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return 'Mmm, ese correo no parece válido 🤔 ¿Me lo escribes de nuevo? (ej: nombre@gmail.com)';
  }

  await updateUsuario(user.phone, { email, estado_conversacion: null });
  return crearYEnviarLink(user.phone, email);
}

async function crearYEnviarLink(phone: string, email: string): Promise<string> {
  const initPoint = await crearSuscripcion(phone, email);
  return `💳 *Activa tu plan Abakus*

Listo, ${email}. Completa tu suscripción de forma segura aquí:
${initPoint}

Apenas se confirme el pago, tu cuenta queda activa al instante. ¡Gracias por confiar en Abakus! 🧮`;
}
