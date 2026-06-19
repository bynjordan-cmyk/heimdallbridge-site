import { Interpretacion, MovimientoInterpretado, Usuario } from '../types';
import {
  contarCuentasPendientes,
  eliminarMovimiento,
  actualizarMovimiento,
  insertCuentaPorCobrar,
  insertMovimiento,
  insertMovimientosMasivo,
  marcarCobrado,
  getMovimientosPeriodo,
} from '../supabase/queries';

/** Etiqueta de correlativo, ej. " #42" (vacío si aún no hay numeración). */
function refTag(correlativo: number | null): string {
  return correlativo != null ? ` #${correlativo}` : '';
}
import { clp } from '../utils/format';
import { mesActual } from '../reports/periodo';

const LIMITE_CUENTAS_BASICO = 3;

export async function handleRegistro(
  user: Usuario,
  interp: Interpretacion,
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

  // === Corregir un movimiento (por #referencia o el último) ===
  if (interp.tipo === 'corregir') {
    const res = await actualizarMovimiento(user.phone, interp.referencia, {
      monto: interp.monto ?? undefined,
      categoria: interp.categoria ?? undefined,
      descripcion: interp.descripcion ?? undefined,
    });

    if (!res) {
      return interp.referencia != null
        ? `No encontré el movimiento #${interp.referencia} 🤔`
        : 'No encontré un movimiento reciente para corregir 🤔 ¿Quieres registrar uno nuevo?';
    }

    const { anterior, actualizado } = res;
    const cambios: string[] = [];
    if (Number(anterior.monto) !== Number(actualizado.monto)) {
      cambios.push(`💲 Monto: ${clp(Number(anterior.monto))} → *${clp(Number(actualizado.monto))}*`);
    }
    if ((anterior.categoria ?? '') !== (actualizado.categoria ?? '')) {
      cambios.push(`🏷️ Categoría: ${anterior.categoria ?? '—'} → *${actualizado.categoria ?? '—'}*`);
    }
    if ((anterior.descripcion ?? '') !== (actualizado.descripcion ?? '')) {
      cambios.push(`📝 Descripción: ${anterior.descripcion ?? '—'} → *${actualizado.descripcion ?? '—'}*`);
    }

    if (cambios.length === 0) {
      return 'No detecté qué cambiar 🤔 Dime el nuevo valor, por ejemplo: "el monto eran 3000".';
    }

    const emoji = actualizado.tipo === 'ingreso' ? '💰' : '💸';
    return `✏️ Movimiento${refTag(actualizado.correlativo)} corregido\n${emoji} ${
      actualizado.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'
    }\n${cambios.join('\n')}`;
  }

  // === Eliminar un movimiento (por #referencia o el último) ===
  if (interp.tipo === 'eliminar') {
    const mov = await eliminarMovimiento(user.phone, interp.referencia);
    if (!mov) {
      return interp.referencia != null
        ? `No encontré el movimiento #${interp.referencia} 🤔`
        : 'No encontré movimientos recientes para borrar 🤔';
    }
    const detalle = [clp(Number(mov.monto)), mov.categoria, mov.descripcion]
      .filter(Boolean)
      .join(' | ');
    const emoji = mov.tipo === 'ingreso' ? '💰' : '💸';
    return `🗑️ Listo, borré el movimiento${refTag(mov.correlativo)}:\n${emoji} ${detalle}`;
  }

  // === Deuda (cuenta por cobrar) requiere monto ===
  if (interp.monto === null) {
    return 'Entendí que quieres registrar algo, pero no detecté el monto 🤔 ¿Cuánto fue?';
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

/** Fecha de hoy en YYYY-MM-DD (default cuando el movimiento no trae fecha). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cierre celebratorio cuando es el PRIMER movimiento del usuario (correlativo #1). */
const PRIMERA_VICTORIA =
  '\n\n🎉 *¡Ese fue tu primer registro en Abakus!* Así de fácil: solo escríbeme y yo llevo la cuenta. 💪';

/**
 * Registra uno o varios ingresos/egresos detectados en un mismo mensaje.
 * - 1 movimiento: confirmación detallada (con tip o alerta de balance).
 * - Varios: los inserta en lote y responde con un resumen.
 * En ambos casos celebra si fue el primer movimiento del usuario (#1).
 */
export async function registrarMovimientos(
  user: Usuario,
  items: MovimientoInterpretado[],
  textoOriginal: string,
): Promise<string> {
  if (items.length === 1) {
    return confirmarMovimientoUnico(user, items[0], textoOriginal);
  }

  const insertados = await insertMovimientosMasivo(
    user.phone,
    items.map((m) => ({
      tipo: m.tipo,
      monto: m.monto,
      categoria: m.categoria,
      descripcion: m.descripcion,
      fecha: m.fecha ?? hoyISO(),
    })),
    textoOriginal,
  );

  const ingresos = items.filter((m) => m.tipo === 'ingreso');
  const egresos = items.filter((m) => m.tipo === 'egreso');
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
  const totalEgresos = egresos.reduce((s, m) => s + m.monto, 0);

  let msg = `✅ *Registré ${items.length} movimientos*`;
  if (ingresos.length > 0) msg += `\n💰 Ingresos: ${clp(totalIngresos)} (${ingresos.length})`;
  if (egresos.length > 0) msg += `\n💸 Egresos: ${clp(totalEgresos)} (${egresos.length})`;
  msg += `\n\nEscribe *resumen* para ver tu balance actualizado.`;

  if (insertados.some((m) => m.correlativo === 1)) {
    msg += PRIMERA_VICTORIA;
  }
  return msg;
}

/** Confirmación detallada para un único ingreso/egreso. */
async function confirmarMovimientoUnico(
  user: Usuario,
  item: MovimientoInterpretado,
  textoOriginal: string,
): Promise<string> {
  const nuevo = await insertMovimiento({
    userPhone: user.phone,
    tipo: item.tipo,
    monto: item.monto,
    categoria: item.categoria,
    descripcion: item.descripcion,
    rawMessage: textoOriginal,
    fecha: item.fecha,
  });

  const detalle = [clp(item.monto), item.categoria, item.descripcion].filter(Boolean).join(' | ');
  const ref = refTag(nuevo.correlativo);
  const victoria = nuevo.correlativo === 1 ? PRIMERA_VICTORIA : '';

  if (item.tipo === 'ingreso') {
    const tip = tipIngreso(item.monto);
    return `✅ Ingreso registrado${ref}\n💰 ${detalle}${tip}${victoria}`;
  }

  // Egreso: calcular balance del mes y alertar si es negativo.
  const periodo = mesActual();
  const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
  const totalIngresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const balance = totalIngresos - totalEgresos;

  const alertaBalance = balance < 0
    ? `\n\n⚠️ _Balance del mes: -${clp(Math.abs(balance))}. Escribe *resumen* para ver el detalle._`
    : '';

  return `📤 Egreso registrado${ref}\n💸 ${detalle}${alertaBalance}${victoria}`;
}

const TIPS_IVA = [
  '💡 _Tip: Recuerda apartar ~10% para retención de honorarios (SII)._',
  '💡 _Tip: ¿Ya tienes apartado para el IVA de este mes? Un 19% sobre tus ingresos afectos te ayuda a no sorprenderte._',
  '💡 _Tip: Con buenos ingresos, considera guardar al menos un 10-15% en una cuenta separada para obligaciones tributarias._',
];

function tipIngreso(monto: number): string {
  if (monto < 300_000) return '';
  const tip = TIPS_IVA[Math.floor(Math.random() * TIPS_IVA.length)];
  return `\n\n${tip}`;
}
