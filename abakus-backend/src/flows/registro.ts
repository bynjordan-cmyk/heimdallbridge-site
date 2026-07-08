import { Interpretacion, MovimientoInterpretado, Usuario } from '../types';
import {
  contarCuentasPendientes,
  eliminarMovimiento,
  actualizarMovimiento,
  insertCuentaPorCobrar,
  insertCuentaPorPagar,
  insertMovimiento,
  insertMovimientosMasivo,
  marcarCobrado,
  marcarSaldado,
  getMovimientosPeriodo,
  buscarCuenta,
  crearCuenta,
  actualizarUltimaCuentaPendiente,
} from '../supabase/queries';

/** Etiqueta de correlativo, ej. " #42" (vacío si aún no hay numeración). */
export function refTag(correlativo: number | null): string {
  return correlativo != null ? ` #${correlativo}` : '';
}

/**
 * Etiqueta de rango para varios movimientos, ej. " (#5–#8)". Si es uno solo usa
 * " #5"; vacío si no hay numeración. Sirve para que el usuario sepa qué números
 * editar/borrar tras un registro múltiple.
 */
export function rangoTag(correlativos: (number | null)[]): string {
  const nums = correlativos.filter((n): n is number => n != null);
  if (nums.length === 0) return '';
  if (nums.length === 1) return ` #${nums[0]}`;
  return ` (#${nums[0]}–#${nums[nums.length - 1]})`;
}
import { formatMonto } from '../utils/format';
import { mesActual } from '../reports/periodo';
import { armarEsperandoCategoria, PREGUNTA_CATEGORIA } from './clasificacion';

const LIMITE_CUENTAS_BASICO = 3;

export async function handleRegistro(
  user: Usuario,
  interp: Interpretacion,
): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);

  // === Marcar deuda como cobrada ===
  if (interp.tipo === 'cobro') {
    const cuenta = await marcarCobrado(user.phone, interp.contraparte, interp.monto);
    if (!cuenta) {
      const quien = interp.contraparte ? `de *${interp.contraparte}*` : 'pendiente';
      return `Mmm, no encontré ninguna cuenta ${quien} activa 🤔 ¿Ya la habías marcado antes?`;
    }
    return `✅ ¡Cobro registrado!\n👤 ${cuenta.contraparte ?? 'Sin contraparte'} | ${f(Number(cuenta.monto))} marcado como *pagado*. 🎉`;
  }

  // === Saldar una cuenta por pagar (el usuario pagó lo que debía) ===
  if (interp.tipo === 'saldar') {
    const cuenta = await marcarSaldado(user.phone, interp.contraparte, interp.monto);
    if (!cuenta) {
      const quien = interp.contraparte ? `a *${interp.contraparte}*` : 'por pagar';
      return `Mmm, no encontré ninguna cuenta ${quien} pendiente 🤔 ¿Ya la habías saldado?`;
    }
    return `✅ ¡Pago registrado!\n👤 ${cuenta.contraparte ?? 'Sin contraparte'} | ${f(Number(cuenta.monto))} marcado como *saldado*. 🎉`;
  }

  // === Corregir la última cuenta por cobrar/pagar (seguimiento) ===
  // Si la corrección trae fecha de vencimiento o contraparte (datos propios de
  // una CxC/CxP, no de un movimiento) y no apunta a un # de movimiento, la
  // aplicamos a la última cuenta pendiente. Ej: "no, págalo el 5", "era a ENEL".
  if (
    interp.tipo === 'corregir' &&
    interp.referencia == null &&
    interp.nuevo_tipo == null &&
    !interp.cuenta &&
    (interp.fecha_vencimiento != null || interp.contraparte != null)
  ) {
    const res = await actualizarUltimaCuentaPendiente(user.phone, {
      contraparte: interp.contraparte ?? undefined,
      monto: interp.monto ?? undefined,
      fechaVencimiento: interp.fecha_vencimiento ?? undefined,
    });
    if (res) {
      const { anterior, actualizada } = res;
      const cambios: string[] = [];
      if ((anterior.contraparte ?? '') !== (actualizada.contraparte ?? '')) {
        cambios.push(`👤 ${anterior.contraparte ?? 'Sin contraparte'} → *${actualizada.contraparte ?? 'Sin contraparte'}*`);
      }
      if (Number(anterior.monto) !== Number(actualizada.monto)) {
        cambios.push(`💲 ${f(Number(anterior.monto))} → *${f(Number(actualizada.monto))}*`);
      }
      if ((anterior.fecha_vencimiento ?? '') !== (actualizada.fecha_vencimiento ?? '')) {
        cambios.push(`📅 Vence: *${actualizada.fecha_vencimiento ?? '—'}*`);
      }
      const etiqueta = actualizada.tipo === 'por_pagar' ? 'Cuenta por pagar' : 'Cuenta por cobrar';
      if (cambios.length > 0) {
        return `✏️ ${etiqueta} actualizada\n👤 ${actualizada.contraparte ?? 'Sin contraparte'} | ${f(Number(actualizada.monto))}\n${cambios.join('\n')}`;
      }
    }
    // Si no había cuenta pendiente, cae al flujo normal de corrección de movimiento.
  }

  // === Corregir un movimiento (por #referencia o el último) ===
  if (interp.tipo === 'corregir') {
    // Si la corrección asigna/cambia la cuenta, la resolvemos (creándola si no
    // existe) para obtener su id.
    let cuentaId: string | undefined;
    let nombreCuentaNueva: string | null = null;
    let cuentaRecienCreada = false;
    if (interp.cuenta) {
      let cuenta = await buscarCuenta(user.phone, interp.cuenta);
      if (!cuenta) {
        const n = interp.cuenta.toLowerCase();
        const tipoC = n.includes('caja') || n.includes('efectivo') || n.includes('billetera') ? 'caja' : 'banco';
        const creada = await crearCuenta(user.phone, interp.cuenta, tipoC, 0);
        cuenta = creada.cuenta;
        cuentaRecienCreada = !creada.actualizada;
      }
      cuentaId = cuenta.id;
      nombreCuentaNueva = cuenta.nombre;
    }

    const res = await actualizarMovimiento(user.phone, interp.referencia, {
      tipo: interp.nuevo_tipo ?? undefined,
      monto: interp.monto ?? undefined,
      categoria: interp.categoria ?? undefined,
      descripcion: interp.descripcion ?? undefined,
      cuenta_id: cuentaId,
    });

    if (!res) {
      return interp.referencia != null
        ? `No encontré el movimiento #${interp.referencia} 🤔`
        : 'No encontré un movimiento reciente para corregir 🤔 ¿Quieres registrar uno nuevo?';
    }

    const { anterior, actualizado } = res;
    const cambios: string[] = [];
    if (cuentaId && anterior.cuenta_id !== cuentaId && nombreCuentaNueva) {
      cambios.push(`🏦 Cuenta: → *${nombreCuentaNueva}*${cuentaRecienCreada ? ' _(creada)_' : ''}`);
    }
    if (anterior.tipo !== actualizado.tipo) {
      const nombreTipo = (t: string) => (t === 'ingreso' ? 'Ingreso' : 'Egreso');
      cambios.push(`🔄 Tipo: ${nombreTipo(anterior.tipo)} → *${nombreTipo(actualizado.tipo)}*`);
    }
    if (Number(anterior.monto) !== Number(actualizado.monto)) {
      cambios.push(`💲 Monto: ${f(Number(anterior.monto))} → *${f(Number(actualizado.monto))}*`);
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
    const detalle = [f(Number(mov.monto)), mov.categoria, mov.descripcion]
      .filter(Boolean)
      .join(' | ');
    const emoji = mov.tipo === 'ingreso' ? '💰' : '💸';
    return `🗑️ Listo, borré el movimiento${refTag(mov.correlativo)}:\n${emoji} ${detalle}`;
  }

  // === Deuda (cobrar) y cuenta por pagar requieren monto ===
  if (interp.monto === null) {
    return 'Entendí que quieres registrar algo, pero no detecté el monto 🤔 ¿Cuánto fue?';
  }

  const esPorPagar = interp.tipo === 'cuenta_pagar';
  const tipoCuenta = esPorPagar ? 'por_pagar' : 'por_cobrar';
  const etiqueta = esPorPagar ? 'por pagar' : 'por cobrar';

  // Plan Básico: máximo 3 cuentas activas por tipo.
  if (user.plan === 'basico') {
    const activas = await contarCuentasPendientes(user.phone, tipoCuenta);
    if (activas >= LIMITE_CUENTAS_BASICO) {
      return `⚠️ Con el *Plan Básico* puedes tener hasta ${LIMITE_CUENTAS_BASICO} cuentas ${etiqueta} activas.\n\nMarca alguna como pagada o actualiza al *Plan Pro* escribiendo *suscribirme* para tener cuentas ilimitadas. 🚀`;
    }
  }

  const datos = {
    userPhone: user.phone,
    contraparte: interp.contraparte,
    monto: interp.monto,
    descripcion: interp.descripcion,
    fechaVencimiento: interp.fecha_vencimiento,
  };
  await (esPorPagar ? insertCuentaPorPagar(datos) : insertCuentaPorCobrar(datos));

  const titulo = esPorPagar ? '📌 Cuenta por pagar registrada' : '📋 Cuenta por cobrar registrada';
  const base = `${titulo}\n👤 ${interp.contraparte ?? 'Sin contraparte'} | ${f(interp.monto)}`;

  // Si no trae fecha de vencimiento, la preguntamos. La respuesta del usuario
  // ("el 5 de julio") se aplica a esta misma cuenta vía corregir (usa el
  // historial), no crea una nueva.
  if (!interp.fecha_vencimiento) {
    return `${base}\n\n📅 ¿Para cuándo es? Dime la fecha de vencimiento (o *sin fecha* si no aplica).`;
  }
  return `${base} | vence ${interp.fecha_vencimiento}`;
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
  const f = (n: number) => formatMonto(n, user.moneda);
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

  const rango = rangoTag(insertados.map((m) => m.correlativo));
  let msg = `✅ *Registré ${items.length} movimientos*${rango}`;
  if (ingresos.length > 0) msg += `\n💰 Ingresos: ${f(totalIngresos)} (${ingresos.length})`;
  if (egresos.length > 0) msg += `\n💸 Egresos: ${f(totalEgresos)} (${egresos.length})`;
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
  const f = (n: number) => formatMonto(n, user.moneda);
  const nuevo = await insertMovimiento({
    userPhone: user.phone,
    tipo: item.tipo,
    monto: item.monto,
    categoria: item.categoria,
    descripcion: item.descripcion,
    rawMessage: textoOriginal,
    fecha: item.fecha,
  });

  const detalle = [f(item.monto), item.categoria, item.descripcion].filter(Boolean).join(' | ');
  const ref = refTag(nuevo.correlativo);
  const victoria = nuevo.correlativo === 1 ? PRIMERA_VICTORIA : '';

  // Si quedó sin clasificar, armamos el estado determinista para que la próxima
  // respuesta del usuario ("Alimentos") clasifique ESTE movimiento (no se pierde).
  let preguntaCat = '';
  if (esSinClasificar(item.categoria)) {
    await armarEsperandoCategoria(user, nuevo.correlativo);
    preguntaCat = PREGUNTA_CATEGORIA;
  }

  if (item.tipo === 'ingreso') {
    const tip = tipIngreso(item.monto);
    return `✅ Ingreso registrado${ref}\n💰 ${detalle}${preguntaCat}${tip}${victoria}`;
  }

  // Egreso: calcular balance del mes y alertar si es negativo.
  const periodo = mesActual();
  const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
  const totalIngresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const balance = totalIngresos - totalEgresos;

  const alertaBalance = balance < 0
    ? `\n\n⚠️ _Balance del mes: -${f(Math.abs(balance))}. Escribe *resumen* para ver el detalle._`
    : '';

  return `📤 Egreso registrado${ref}\n💸 ${detalle}${preguntaCat}${alertaBalance}${victoria}`;
}

/** Sugerencia gentil para clasificar cuando el movimiento quedó "Sin clasificar". */
export function sugerenciaClasificar(categoria: string | null): string {
  return esSinClasificar(categoria)
    ? '\n\n🏷️ _Quedó *Sin clasificar*. Dime en qué fue y lo ordeno (ej. "era comida")._'
    : '';
}

/** ¿La categoría está vacía o marcada como "Sin clasificar"? */
export function esSinClasificar(categoria: string | null): boolean {
  const c = (categoria ?? '').trim().toLowerCase();
  return c === '' || c === 'sin clasificar';
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
