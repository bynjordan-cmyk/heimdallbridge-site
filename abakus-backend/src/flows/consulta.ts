import { Movimiento, Usuario } from '../types';
import { getCuentasPendientes, getMovimientosPeriodo, setMeta } from '../supabase/queries';
import { clp } from '../utils/format';
import { mesActual, mesPasado, parsearPeriodo } from '../reports/periodo';

export type ComandoEspecial = 'resumen' | 'cobros' | 'ayuda' | 'pago' | 'reporte' | 'eliminar' | 'comparar' | 'meta';

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const tieneMes = (s: string) => MESES_ES.some((m) => s.includes(m));

export function detectarComando(texto: string): ComandoEspecial | null {
  const t = texto.trim().toLowerCase();
  if (t === 'resumen' || t === 'saldo') return 'resumen';
  if ((t.startsWith('resumen') || t.startsWith('saldo')) && tieneMes(t)) return 'resumen';
  if (t === 'cobros' || t === 'pendientes') return 'cobros';
  if (t === 'ayuda' || t === 'help' || t === 'menu' || t === 'menú') return 'ayuda';
  if (
    t === 'pagar' || t === 'suscribirme' || t === 'suscribir' ||
    t === 'suscripción' || t === 'suscripcion' || t === 'plan' || t === 'premium'
  ) return 'pago';
  if (t === 'reporte' || t.startsWith('reporte ') || t === 'informe' || t.startsWith('informe ') || t === 'exportar') return 'reporte';
  if (t === 'deshacer' || t === 'undo' || t === 'borra el último' || t === 'borrar último' || t === 'eliminar último') return 'eliminar';
  if (t === 'comparar' || t === 'comparativo' || t === 'tendencia' || t.includes('vs el mes') || t.includes('mes pasado')) return 'comparar';
  if (t === 'meta' || t.startsWith('meta ') || t === 'objetivo' || t.startsWith('objetivo ') || t.startsWith('mi meta')) return 'meta';
  return null;
}

const AYUDA = `🧮 *Abakus* — esto es lo que puedo hacer:

• Registra natural: "vendí 50000 en diseño" o "pagué 12000 de luz".
• *resumen* → balance del mes con desglose por categoría.
• *resumen mayo* → balance de cualquier mes anterior.
• *comparar* → este mes vs el mes pasado.
• *cobros* → tus cuentas por cobrar activas.
• *reporte* → Excel con detalle completo (o "reporte mayo").
• *meta 1500000* → fija tu objetivo mensual de ingresos.
• "Juan me pagó" → marca la deuda como cobrada.
• *deshacer* → borra el último movimiento registrado.
• Cuéntame una deuda: "Juan me debe 30000 para el 30/06".
• *plan* o *suscribirme* → activa tu suscripción.

¿En qué te ayudo?`;

export async function handleComando(
  user: Usuario,
  comando: ComandoEspecial,
  textoOriginal?: string,
): Promise<string> {
  if (comando === 'ayuda') return AYUDA;

  // Manejados directamente en handler.ts
  // 'pago', 'reporte', 'eliminar' → return early desde handler

  if (comando === 'meta') {
    return handleMeta(user, textoOriginal ?? '');
  }

  if (comando === 'comparar') {
    return handleComparativo(user);
  }

  if (comando === 'resumen') {
    const t = (textoOriginal ?? '').toLowerCase();
    const esMesActual = !tieneMes(t);
    const periodo = esMesActual ? mesActual() : parsearPeriodo(t);
    const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
    return formatearResumen(movs, periodo.label, esMesActual ? user.meta_mensual : null);
  }

  // comando === 'cobros'
  const cuentas = await getCuentasPendientes(user.phone);
  if (cuentas.length === 0) {
    return '🎉 No tienes cuentas por cobrar pendientes.';
  }

  const lineas = cuentas
    .map((c) => {
      const vence = c.fecha_vencimiento ? ` (vence ${c.fecha_vencimiento})` : '';
      return `• ${c.contraparte ?? 'Sin contraparte'}: ${clp(Number(c.monto))}${vence}`;
    })
    .join('\n');

  const total = cuentas.reduce((acc, c) => acc + Number(c.monto), 0);
  return `📋 *Cuentas por cobrar pendientes*\n${lineas}\n\nTotal: ${clp(total)}`;
}

async function handleMeta(user: Usuario, textoOriginal: string): Promise<string> {
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
      return `🎯 *Tu meta mensual:* ${clp(user.meta_mensual)}\nProgreso: ${clp(ingresos)} ${barra} ${pct}%\n\nPara cambiarla escribe: *meta [monto]*`;
    }
    return `🎯 Aún no tienes una meta mensual.\n\nEscríbeme algo como:\n*meta 1500000*\n\nY te mostraré tu progreso cada vez que consultes el resumen.`;
  }

  const monto = Number(match[0]);
  if (monto < 1000) {
    return `⚠️ El monto parece muy bajo. ¿Quisiste escribir *meta ${monto}000*? Si es correcto, intenta de nuevo con el monto completo.`;
  }

  await setMeta(user.phone, monto);
  return `🎯 ¡Meta mensual actualizada!\nObjetivo: *${clp(monto)}/mes*\n\nEscribe *resumen* para ver tu progreso. 💪`;
}

async function handleComparativo(user: Usuario): Promise<string> {
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
    return diff !== 0 ? ` (${signo}${clp(diff)})` : '';
  };

  const tendencia = (actual: number, pasado: number, mayorEsMejor = true) => {
    if (pasado === 0) return '';
    const pct = ((actual - pasado) / pasado) * 100;
    const sube = actual > pasado;
    const esBueno = sube === mayorEsMejor;
    return ` ${esBueno ? '📈' : '📉'} ${Math.abs(Math.round(pct))}%`;
  };

  return `📊 *${actual.label} vs ${pasado.label}*

💰 Ingresos: ${clp(a.ingresos)}${delta(a.ingresos, p.ingresos)}${tendencia(a.ingresos, p.ingresos)}
💸 Egresos: ${clp(a.egresos)}${delta(a.egresos, p.egresos)}${tendencia(a.egresos, p.egresos, false)}
🧮 Balance: ${clp(balanceActual)}${delta(balanceActual, balancePasado)}${tendencia(balanceActual, balancePasado)}`;
}

function progresoBarra(pct: number): string {
  const llenas = Math.min(5, Math.floor(pct / 20));
  return '█'.repeat(llenas) + '░'.repeat(5 - llenas);
}

export function formatearResumen(movs: Movimiento[], label: string, meta?: number | null): string {
  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const balance = ingresos - egresos;

  let msg = `📊 *Resumen ${label}*\n💰 Ingresos: ${clp(ingresos)}\n💸 Egresos: ${clp(egresos)}\n🧮 Balance: ${balance >= 0 ? '' : '-'}${clp(Math.abs(balance))}`;

  // Meta y proyección (solo cuando se pasa meta, es decir, mes actual)
  if (meta) {
    const pct = Math.round((ingresos / meta) * 100);
    const barra = progresoBarra(pct);
    msg += `\n\n🎯 *Meta:* ${clp(ingresos)} / ${clp(meta)} ${barra} ${pct}%`;

    // Proyección basada en ritmo diario
    const hoy = new Date();
    const dia = hoy.getDate();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    if (dia > 0 && ingresos > 0) {
      const proyeccion = Math.round((ingresos / dia) * diasMes);
      const emojiProy = proyeccion >= meta ? '📈' : '📉';
      msg += `\n${emojiProy} _Proyección al cierre: ~${clp(proyeccion)}_`;
    }
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
    const desglose = top.map(([cat, total]) => `  • ${cat}: ${clp(total)}`).join('\n');
    msg += `\n\n📁 *Egresos por categoría:*\n${desglose}`;
  }

  if (movs.length > 0) {
    msg += `\n\n_(${movs.length} movimiento${movs.length !== 1 ? 's' : ''})_`;
  }

  return msg;
}
