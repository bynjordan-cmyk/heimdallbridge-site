import { Movimiento, Usuario } from '../types';
import { getCuentasPendientes, getCuentasPorPagar, getMovimientosPeriodo, setMeta } from '../supabase/queries';
import { formatMonto } from '../utils/format';
import {
  diferenciaMeses,
  mesActual,
  mesPasado,
  parsearMesObjetivo,
  parsearPeriodo,
  periodoMesesAtras,
} from '../reports/periodo';

export type ComandoEspecial = 'resumen' | 'detalle' | 'cobros' | 'porpagar' | 'ayuda' | 'pago' | 'planes' | 'reporte' | 'eliminar' | 'comparar' | 'meta' | 'proyeccion' | 'plantilla';

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const tieneMes = (s: string) => MESES_ES.some((m) => s.includes(m));

export function detectarComando(texto: string): ComandoEspecial | null {
  const t = texto.trim().toLowerCase();
  if (t === 'resumen' || t === 'saldo') return 'resumen';
  if ((t.startsWith('resumen') || t.startsWith('saldo')) && tieneMes(t)) return 'resumen';
  if (
    t === 'por pagar' || t === 'cuentas por pagar' || t === 'porpagar' ||
    t === 'pagos pendientes' || t === 'qué debo' || t === 'que debo' ||
    t === 'qué pago' || t === 'que pago' || t === 'mis deudas' || t === 'deudas' ||
    t === 'a quién le debo' || t === 'a quien le debo'
  ) return 'porpagar';
  if (t === 'cobros' || t === 'pendientes' || t === 'por cobrar' || t === 'me deben') return 'cobros';
  if (t === 'ayuda' || t === 'help' || t === 'menu' || t === 'menú') return 'ayuda';
  if (
    t === 'pagar' || t === 'suscribirme' || t === 'suscribir' ||
    t === 'suscripción' || t === 'suscripcion' || t === 'quiero pagar' ||
    t === 'activar' || t === 'activar plan' || t === 'quiero suscribirme'
  ) return 'pago';
  // Preguntas informativas sobre planes/precios. Se excluyen mensajes con
  // números (probablemente un registro tipo "plan de ahorro 5000").
  const sinNumero = !/\d/.test(t);
  if (
    t === 'plan' || t === 'planes' || t === 'premium' ||
    (sinNumero && (
      t.includes('plan') || t.includes('precio') || t.includes('tarifa') ||
      t.includes('cuánto cuesta') || t.includes('cuanto cuesta') ||
      t.includes('cuánto vale') || t.includes('cuanto vale') ||
      t.includes('cuánto sale') || t.includes('cuanto sale') ||
      t.includes('tiene costo') || t.includes('es pago') || t.includes('es gratis')
    ))
  ) return 'planes';
  // Detalle EN EL CHAT (texto), no Excel. Se evalúa ANTES que 'reporte' para que
  // frases como "no lo quiero en excel, muéstrame en el chat" no caigan en Excel.
  if (
    t === 'detalle' || t.startsWith('detalle') ||
    t.includes('en el chat') || t.includes('en chat') || t.includes('por chat') ||
    t.includes('en texto') || t.includes('por texto') ||
    t.includes('aquí mismo') || t.includes('aqui mismo') || t.includes('por aquí') || t.includes('por aqui') ||
    t.includes('sin excel') || t.includes('no excel') || t.includes('no quiero excel') || t.includes('no en excel') || t.includes('no lo quiero en excel') ||
    t.includes('lista de movimientos') || t.includes('lístame') || t.includes('listame') ||
    t.includes('muéstrame los movimientos') || t.includes('muestrame los movimientos') ||
    t.includes('ver movimientos') || t.includes('muéstrame el detalle') || t.includes('muestrame el detalle')
  ) return 'detalle';
  if (
    t === 'reporte' || t.startsWith('reporte ') ||
    t === 'informe' || t.startsWith('informe ') ||
    t === 'exportar' || t === 'exporta' ||
    t.includes('excel') || t.includes('reporte') || t.includes('informe')
  ) return 'reporte';
  if (t === 'deshacer' || t === 'undo' || t === 'borra el último' || t === 'borrar último' || t === 'eliminar último') return 'eliminar';
  if (t === 'comparar' || t === 'comparativo' || t === 'tendencia' || t.includes('vs el mes') || t.includes('mes pasado')) return 'comparar';
  if (t.includes('proyec')) return 'proyeccion';
  if (t === 'meta' || t.startsWith('meta ') || t === 'objetivo' || t.startsWith('objetivo ') || t.startsWith('mi meta')) return 'meta';
  if (t === 'plantilla' || t === 'template' || t === 'formato') return 'plantilla';
  return null;
}

const AYUDA = `🧮 *Abakus* — esto es lo que puedo hacer:

• Registra natural: "vendí 50000 en diseño" o "pagué 12000 de luz".
• *resumen* → balance del mes con desglose por categoría y proyección de cierre.
• *resumen mayo* → balance de cualquier mes anterior.
• *proyección julio* → estimado de un mes futuro según tu historial.
• *comparar* → este mes vs el mes pasado.
• *cobros* → lo que te deben (cuentas por cobrar). "Juan me debe 30000".
• *por pagar* → lo que tú debes (cuentas por pagar). "le debo 20000 a Ana" · "ya le pagué a Ana".
• *detalle* → lista tus movimientos aquí en el chat (o "detalle mayo").
• *reporte* → Excel con detalle completo (o "reporte mayo").
• *meta 1500000* → fija tu objetivo mensual de ingresos (opcional).
• "Juan me pagó" → marca la deuda como cobrada.
• Corrige sobre la marcha: "no, eran 3000" o "cambia la categoría a transporte" → ajusta el último movimiento.
• *deshacer* → borra el último movimiento registrado.
• Cuéntame una deuda: "Juan me debe 30000 para el 30/06".
• *plantilla* → descarga un Excel para cargar varios movimientos de una vez. Complétalo y reenvíamelo por aquí.
• *planes* → ver los planes y precios · *suscribirme* → activar tu plan.

¿En qué te ayudo?`;

export async function handleComando(
  user: Usuario,
  comando: ComandoEspecial,
  textoOriginal?: string,
): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  if (comando === 'ayuda') return AYUDA;

  // Manejados directamente en handler.ts
  // 'pago', 'planes', 'reporte', 'eliminar', 'plantilla' → return early desde handler

  if (comando === 'meta') {
    return handleMeta(user, textoOriginal ?? '');
  }

  if (comando === 'proyeccion') {
    return handleProyeccion(user, textoOriginal ?? '');
  }

  if (comando === 'comparar') {
    return handleComparativo(user);
  }

  if (comando === 'resumen') {
    const t = (textoOriginal ?? '').toLowerCase();
    const esMesActual = !tieneMes(t);
    const periodo = esMesActual ? mesActual() : parsearPeriodo(t);
    const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
    return formatearResumen(movs, periodo.label, esMesActual, esMesActual ? user.meta_mensual : null, user.moneda);
  }

  if (comando === 'detalle') {
    return handleDetalle(user, textoOriginal ?? '');
  }

  if (comando === 'porpagar') {
    const cuentas = await getCuentasPorPagar(user.phone);
    if (cuentas.length === 0) {
      return '🎉 No tienes cuentas por pagar pendientes.';
    }
    const lineas = cuentas
      .map((c) => {
        const vence = c.fecha_vencimiento ? ` (vence ${c.fecha_vencimiento})` : '';
        return `• ${c.contraparte ?? 'Sin contraparte'}: ${f(Number(c.monto))}${vence}`;
      })
      .join('\n');
    const total = cuentas.reduce((acc, c) => acc + Number(c.monto), 0);
    return `📌 *Cuentas por pagar pendientes*\n${lineas}\n\nTotal a pagar: ${f(total)}`;
  }

  // comando === 'cobros'
  const cuentas = await getCuentasPendientes(user.phone);
  if (cuentas.length === 0) {
    return '🎉 No tienes cuentas por cobrar pendientes.';
  }

  const lineas = cuentas
    .map((c) => {
      const vence = c.fecha_vencimiento ? ` (vence ${c.fecha_vencimiento})` : '';
      return `• ${c.contraparte ?? 'Sin contraparte'}: ${f(Number(c.monto))}${vence}`;
    })
    .join('\n');

  const total = cuentas.reduce((acc, c) => acc + Number(c.monto), 0);
  return `📋 *Cuentas por cobrar pendientes*\n${lineas}\n\nTotal: ${f(total)}`;
}

const MAX_DETALLE = 40;

/** Lista los movimientos del período como texto en el chat (alternativa al Excel). */
async function handleDetalle(user: Usuario, textoOriginal: string): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  const t = textoOriginal.toLowerCase();
  const periodo = tieneMes(t) ? parsearPeriodo(t) : mesActual();
  const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);

  if (movs.length === 0) {
    return `📋 No tienes movimientos registrados en ${periodo.label}.`;
  }

  const orden = [...movs].sort((a, b) =>
    a.fecha === b.fecha
      ? (a.correlativo ?? 0) - (b.correlativo ?? 0)
      : a.fecha.localeCompare(b.fecha),
  );

  const lineas = orden.slice(0, MAX_DETALLE).map((m) => {
    const ref = m.correlativo != null ? `#${m.correlativo} ` : '';
    const emoji = m.tipo === 'ingreso' ? '💰' : '💸';
    const cat = m.categoria ? ` · ${m.categoria}` : '';
    return `${ref}${emoji} ${diaMes(m.fecha)} · ${f(Number(m.monto))}${cat}`;
  }).join('\n');

  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const balance = ingresos - egresos;

  let msg = `📋 *Detalle ${periodo.label}*\n${lineas}`;
  if (orden.length > MAX_DETALLE) {
    msg += `\n_…y ${orden.length - MAX_DETALLE} más. Escribe *reporte* para el Excel completo._`;
  }
  msg += `\n\n💰 Ingresos: ${f(ingresos)}\n💸 Egresos: ${f(egresos)}\n🧮 Balance: ${
    balance < 0 ? '-' : ''
  }${f(Math.abs(balance))}`;
  return msg;
}

/** "2026-06-19" -> "19/06". */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

async function handleMeta(user: Usuario, textoOriginal: string): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  // Extraer número del texto (ignora puntos y comas de miles)
  const limpio = textoOriginal.replace(/[$.]/g, '').replace(',', '');
  const match = limpio.match(/\d+/);

  if (!match) {
    // Sin número → mostrar meta actual o instrucciones
    if (user.meta_mensual) {
      const periodo = mesActual();
      const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
      const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
      const pct = Math.round((ingresos / user.meta_mensual) * 100);
      const barra = progresoBarra(pct);
      return `🎯 *Tu meta mensual:* ${f(user.meta_mensual)}\nProgreso: ${f(ingresos)} ${barra} ${pct}%\n\nPara cambiarla escribe: *meta [monto]*`;
    }
    return `🎯 Aún no tienes una meta mensual.\n\nEscríbeme algo como:\n*meta 1500000*\n\nY te mostraré tu progreso cada vez que consultes el resumen.`;
  }

  const monto = Number(match[0]);
  if (monto < 1000) {
    return `⚠️ El monto parece muy bajo. ¿Quisiste escribir *meta ${monto}000*? Si es correcto, intenta de nuevo con el monto completo.`;
  }

  await setMeta(user.phone, monto);
  return `🎯 ¡Meta mensual actualizada!\nObjetivo: *${f(monto)}/mes*\n\nEscribe *resumen* para ver tu progreso. 💪`;
}

/**
 * Proyección a un mes específico. Si el mes es el actual, usa el ritmo diario
 * (igual que en el resumen). Si es futuro, promedia los últimos meses con
 * datos. Si ya pasó, simplemente muestra el resumen real (no es proyección).
 */
async function handleProyeccion(user: Usuario, textoOriginal: string): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  const objetivo = parsearMesObjetivo(textoOriginal) ?? periodoMesesAtras(-1);
  const delta = diferenciaMeses(objetivo);

  if (delta < 0) {
    const movs = await getMovimientosPeriodo(user.phone, objetivo.desde, objetivo.hasta);
    return `_${objetivo.label} ya pasó, así que este es el resultado real (no una proyección):_\n\n${formatearResumen(movs, objetivo.label, false, null, user.moneda)}`;
  }

  if (delta === 0) {
    const movs = await getMovimientosPeriodo(user.phone, objetivo.desde, objetivo.hasta);
    return formatearResumen(movs, objetivo.label, true, user.meta_mensual, user.moneda);
  }

  // Mes futuro: promedio de los últimos 3 meses con movimientos.
  const historico = await Promise.all(
    [1, 2, 3].map(async (n) => {
      const p = periodoMesesAtras(n);
      const movs = await getMovimientosPeriodo(user.phone, p.desde, p.hasta);
      return { p, movs };
    }),
  );

  const conDatos = historico.filter((h) => h.movs.length > 0);
  if (conDatos.length === 0) {
    return `🔮 Aún no tengo suficiente historial para proyectar *${objetivo.label}*.\n\nSigue registrando tus ingresos y gastos este mes y la próxima vez podré estimarlo mejor. 📈`;
  }

  const sumaTipo = (tipo: 'ingreso' | 'egreso') =>
    conDatos.reduce(
      (acc, h) => acc + h.movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0),
      0,
    );

  const ingresosProy = Math.round(sumaTipo('ingreso') / conDatos.length);
  const egresosProy = Math.round(sumaTipo('egreso') / conDatos.length);
  const balanceProy = ingresosProy - egresosProy;
  const signo = balanceProy >= 0 ? '+' : '-';

  return `🔮 *Proyección para ${objetivo.label}*\n_(estimado según el promedio de tus últimos ${conDatos.length} mes${conDatos.length !== 1 ? 'es' : ''} con movimientos)_\n\n💰 Ingresos: ~${f(ingresosProy)}\n💸 Egresos: ~${f(egresosProy)}\n🧮 Balance: ${signo}${f(Math.abs(balanceProy))}`;
}

async function handleComparativo(user: Usuario): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  const actual = mesActual();
  const pasado = mesPasado();

  const [movsActual, movsPasado] = await Promise.all([
    getMovimientosPeriodo(user.phone, actual.desde, actual.hasta),
    getMovimientosPeriodo(user.phone, pasado.desde, pasado.hasta),
  ]);

  const stats = (movs: Movimiento[]) => ({
    ingresos: movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0),
    egresos: movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0),
  });

  const a = stats(movsActual);
  const p = stats(movsPasado);
  const balanceActual = a.ingresos - a.egresos;
  const balancePasado = p.ingresos - p.egresos;

  const delta = (actual: number, pasado: number) => {
    const diff = actual - pasado;
    const signo = diff >= 0 ? '+' : '';
    return diff !== 0 ? ` (${signo}${f(diff)})` : '';
  };

  const tendencia = (actual: number, pasado: number, mayorEsMejor = true) => {
    if (pasado === 0) return '';
    const pct = ((actual - pasado) / pasado) * 100;
    const sube = actual > pasado;
    const esBueno = sube === mayorEsMejor;
    return ` ${esBueno ? '📈' : '📉'} ${Math.abs(Math.round(pct))}%`;
  };

  return `📊 *${actual.label} vs ${pasado.label}*

💰 Ingresos: ${f(a.ingresos)}${delta(a.ingresos, p.ingresos)}${tendencia(a.ingresos, p.ingresos)}
💸 Egresos: ${f(a.egresos)}${delta(a.egresos, p.egresos)}${tendencia(a.egresos, p.egresos, false)}
🧮 Balance: ${f(balanceActual)}${delta(balanceActual, balancePasado)}${tendencia(balanceActual, balancePasado)}`;
}

function progresoBarra(pct: number): string {
  const llenas = Math.min(5, Math.floor(pct / 20));
  return '█'.repeat(llenas) + '░'.repeat(5 - llenas);
}

export function formatearResumen(
  movs: Movimiento[],
  label: string,
  esMesActual = false,
  meta?: number | null,
  moneda?: string | null,
): string {
  const f = (n: number) => formatMonto(n, moneda);
  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const balance = ingresos - egresos;

  let msg = `📊 *Resumen ${label}*\n💰 Ingresos: ${f(ingresos)}\n💸 Egresos: ${f(egresos)}\n🧮 Balance: ${balance >= 0 ? '' : '-'}${f(Math.abs(balance))}`;

  // Proyección de cierre: siempre en el mes actual (no depende de meta).
  if (esMesActual && ingresos > 0) {
    const hoy = new Date();
    const dia = hoy.getDate();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    if (dia < diasMes) {
      const proyIngresos = Math.round((ingresos / dia) * diasMes);
      const proyEgresos = Math.round((egresos / dia) * diasMes);
      const proyBalance = proyIngresos - proyEgresos;
      const signo = proyBalance >= 0 ? '+' : '-';
      msg += `\n\n🔮 *Proyección al cierre del mes:*\n  💰 Ingresos: ~${f(proyIngresos)}\n  💸 Egresos: ~${f(proyEgresos)}\n  🧮 Balance: ${signo}${f(Math.abs(proyBalance))}`;
    }
  }

  // Meta mensual: bloque opcional, solo si el usuario fijó una.
  if (esMesActual && meta) {
    const pct = Math.round((ingresos / meta) * 100);
    const barra = progresoBarra(pct);
    const emoji = ingresos >= meta ? '🎉' : '🎯';
    msg += `\n\n${emoji} *Meta:* ${f(ingresos)} / ${f(meta)} ${barra} ${pct}%`;
  }

  // Desglose por categoría (solo egresos con categoría, top 5)
  const cats = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== 'egreso' || !m.categoria) continue;
    cats.set(m.categoria, (cats.get(m.categoria) ?? 0) + Number(m.monto));
  }

  if (cats.size > 0) {
    const top = [...cats.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const desglose = top.map(([cat, total]) => `  • ${cat}: ${f(total)}`).join('\n');
    msg += `\n\n📁 *Egresos por categoría:*\n${desglose}`;
  }

  if (movs.length > 0) {
    msg += `\n\n_(${movs.length} movimiento${movs.length !== 1 ? 's' : ''})_`;
  }

  return msg;
}
