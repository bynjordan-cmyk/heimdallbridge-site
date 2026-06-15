import { Usuario } from '../types';
import { config } from '../config';

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

  if (config.pago.mercadopagoLink) {
    return `${base}\n\n¡Sigo aquí para ayudarte! 🧮`;
  }
  return `${base}\n\n(La suscripción se activará muy pronto 🙌)`;
}
