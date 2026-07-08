import { Usuario } from '../types';
import { contarDatosUsuario, reiniciarCuenta, updateUsuario } from '../supabase/queries';
import { limpiarHistorial } from '../utils/contexto';

// "Empezar de cero" (borrón y cuenta nueva) con confirmación doble.
// Borra movimientos + cuentas/saldos + cuentas por cobrar/pagar, pero conserva
// la suscripción y lo que Abakus aprendió (negocio, tono, memoria, moneda).
// Es irreversible, por eso exige que el usuario escriba CONFIRMAR.

const ESTADO = 'confirmar_reinicio';
const PALABRA = 'CONFIRMAR';

/** ¿El usuario está en el paso de confirmar el reinicio? */
export function esperandoConfirmacionReinicio(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO;
}

/**
 * Paso 1: avisa qué se borrará y deja al usuario en estado de confirmación.
 * Si no tiene nada que borrar, no arma el estado.
 */
export async function iniciarReinicio(user: Usuario): Promise<string> {
  const { movimientos, cuentas, pendientes } = await contarDatosUsuario(user.phone);
  const total = movimientos + cuentas + pendientes;
  if (total === 0) {
    return 'Tu cuenta ya está limpia 🙂 No tienes nada que borrar. Registra tu primer movimiento cuando quieras.';
  }

  await updateUsuario(user.phone, { estado_conversacion: ESTADO });
  user.estado_conversacion = ESTADO;

  const detalle = [
    movimientos ? `• ${movimientos} movimiento(s)` : null,
    cuentas ? `• ${cuentas} cuenta(s) y sus saldos` : null,
    pendientes ? `• ${pendientes} cuenta(s) por cobrar/pagar` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `⚠️ *Empezar de cero* borrará:\n${detalle}\n\nEsto *no se puede deshacer*. Tu suscripción y lo que aprendí de ti se mantienen.\n\nSi estás seguro, responde *${PALABRA}*. Cualquier otra cosa lo cancela.`;
}

/**
 * Paso 2: ejecuta el reinicio solo si el usuario escribió CONFIRMAR; en cualquier
 * otro caso, cancela sin borrar nada. Siempre limpia el estado de confirmación.
 */
export async function procesarConfirmacionReinicio(user: Usuario, texto: string): Promise<string> {
  // Salimos del estado pase lo que pase (no dejar al usuario atrapado).
  await updateUsuario(user.phone, { estado_conversacion: null });
  user.estado_conversacion = null;

  if (texto.trim().toUpperCase() !== PALABRA) {
    return 'Cancelado, no borré nada 👍 Todo sigue como estaba.';
  }

  const r = await reiniciarCuenta(user.phone);
  // Limpia cualquier movimiento pendiente en memoria y el historial conversacional.
  await updateUsuario(user.phone, { pendiente: null }).catch(() => undefined);
  user.pendiente = null;
  limpiarHistorial(user.phone);

  const partes = [
    `${r.movimientos} movimiento(s)`,
    r.cuentas ? `${r.cuentas} cuenta(s)` : null,
    r.pendientes ? `${r.pendientes} por cobrar/pagar` : null,
  ].filter(Boolean);

  return `🧹 *Listo, empezaste de cero.*\nBorré ${partes.join(', ')}.\n\nTu suscripción sigue activa. Cuando quieras, registra tu primer movimiento 💪`;
}
