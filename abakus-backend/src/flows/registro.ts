import { Interpretacion, Usuario } from '../types';
import { insertCuentaPorCobrar, insertMovimiento } from '../supabase/queries';
import { clp } from '../utils/format';

/**
 * Persiste un ingreso/egreso (movimientos) o una deuda (cuentas_por_cobrar)
 * y devuelve el mensaje de confirmación para el usuario.
 */
export async function handleRegistro(user: Usuario, interp: Interpretacion): Promise<string> {
  if (interp.monto === null) {
    return 'Entendí que quieres registrar algo, pero no detecté el monto 🤔 ¿Cuánto fue?';
  }

  if (interp.tipo === 'ingreso' || interp.tipo === 'egreso') {
    await insertMovimiento({
      userId: user.id,
      tipo: interp.tipo,
      monto: interp.monto,
      categoria: interp.categoria,
      descripcion: interp.descripcion,
    });

    const detalle = [clp(interp.monto), interp.categoria, interp.descripcion]
      .filter(Boolean)
      .join(' | ');

    return interp.tipo === 'ingreso'
      ? `✅ Ingreso registrado\n💰 ${detalle}`
      : `📤 Egreso registrado\n💸 ${detalle}`;
  }

  // tipo === 'deuda' → cuenta por cobrar
  await insertCuentaPorCobrar({
    userId: user.id,
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
