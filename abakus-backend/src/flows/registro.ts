import { Interpretacion, Usuario } from '../types';
import {
  contarCuentasPendientes,
  eliminarMovimiento,
  actualizarMovimiento,
  insertCuentaPorCobrar,
  insertMovimiento,
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

  // === Registro de monto requerido ===
  if (interp.monto === null) {
    return 'Entendí que quieres registrar algo, pero no detecté el monto 🤔 ¿Cuánto fue?';
  }

  if (interp.tipo === 'ingreso' || interp.tipo === 'egreso') {
    const nuevo = await insertMovimiento({
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
    const ref = refTag(nuevo.correlativo);

    if (interp.tipo === 'ingreso') {
      const tip = tipIngreso(interp.monto);
      return `✅ Ingreso registrado${ref}\n💰 ${detalle}${tip}`;
    }

    // Egreso: calcular balance del mes y alertar si es negativo
    const periodo = mesActual();
    const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
    const totalIngresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
    const totalEgresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
    const balance = totalIngresos - totalEgresos;

    const alertaBalance = balance < 0
      ? `\n\n⚠️ _Balance del mes: -${clp(Math.abs(balance))}. Escribe *resumen* para ver el detalle._`
      : '';

    return `📤 Egreso registrado${ref}\n💸 ${detalle}${alertaBalance}`;
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
