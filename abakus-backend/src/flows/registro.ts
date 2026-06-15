import { Interpretacion, Usuario } from '../types';
import {
  contarCuentasPendientes,
  eliminarUltimoMovimiento,
  insertCuentaPorCobrar,
  insertMovimiento,
  marcarCobrado,
} from '../supabase/queries';
import { clp } from '../utils/format';

const LIMITE_CUENTAS_BASICO = 3;

export async function handleRegistro(
  user: Usuario,
  interp: Interpretacion,
  textoOriginal: string,
): Promise<string> {

  // === Marcar deuda como cobrada ===
  if (interp.tipo === 'cobro') {
    const cuenta = await marcarCobrado(user.phone, interp.contraparte, interp.monto);
    if (!cuenta) {
      const quien = interp.contraparte ? `de *${interp.contraparte}*` : 'pendiente';
      return `Mmm, no encontré ninguna cuenta ${quien} activa 🤔 ¿Ya la habías marcado antes?`;
    }
    return `✅ ¡Cobro registrado!\n👤 ${cuenta.contraparte ?? 'Sin contraparte'} | ${clp(Number(cuenta.monto))} marcado como *pagado*. 🎉`;
  }

  // === Eliminar último movimiento ===
  if (interp.tipo === 'eliminar') {
    const mov = await eliminarUltimoMovimiento(user.phone);
    if (!mov) {
      return 'No encontré movimientos recientes para borrar 🤔';
    }
    const detalle = [clp(Number(mov.monto)), mov.categoria, mov.descripcion]
      .filter(Boolean)
      .join(' | ');
    const emoji = mov.tipo === 'ingreso' ? '💰' : '💸';
    return `🗑️ Listo, borré el último movimiento:\n${emoji} ${detalle}`;
  }

  // === Registro de monto requerido ===
  if (interp.monto === null) {
    return 'Entendí que quieres registrar algo, pero no detecté el monto 🤔 ¿Cuánto fue?';
  }

  if (interp.tipo === 'ingreso' || interp.tipo === 'egreso') {
    await insertMovimiento({
      userPhone: user.phone,
      tipo: interp.tipo,
      monto: interp.monto,
      categoria: interp.categoria,
      descripcion: interp.descripcion,
      rawMessage: textoOriginal,
    });

    const detalle = [clp(interp.monto), interp.categoria, interp.descripcion]
      .filter(Boolean)
      .join(' | ');

    return interp.tipo === 'ingreso'
      ? `✅ Ingreso registrado\n💰 ${detalle}`
      : `📤 Egreso registrado\n💸 ${detalle}`;
  }

  // tipo === 'deuda' → cuenta por cobrar
  // Plan Básico: máximo 3 cuentas activas.
  if (user.plan === 'basico') {
    const activas = await contarCuentasPendientes(user.phone);
    if (activas >= LIMITE_CUENTAS_BASICO) {
      return `⚠️ Con el *Plan Básico* puedes tener hasta ${LIMITE_CUENTAS_BASICO} cuentas por cobrar activas.\n\nMarca alguna como cobrada o actualiza al *Plan Pro* escribiendo *suscribirme* para tener cuentas ilimitadas. 🚀`;
    }
  }

  await insertCuentaPorCobrar({
    userPhone: user.phone,
    contraparte: interp.contraparte,
    monto: interp.monto,
    descripcion: interp.descripcion,
    fechaVencimiento: interp.fecha_vencimiento,
  });

  const vence = interp.fecha_vencimiento ? ` | vence ${interp.fecha_vencimiento}` : '';
  return `📋 Cuenta por cobrar registrada\n👤 ${
    interp.contraparte ?? 'Sin contraparte'
  } | ${clp(interp.monto)}${vence}`;
}
