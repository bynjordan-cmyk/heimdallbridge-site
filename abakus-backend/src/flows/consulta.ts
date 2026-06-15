import { Usuario } from '../types';
import { getCuentasPendientes, getMovimientosPeriodo, getResumenMes } from '../supabase/queries';
import { clp } from '../utils/format';
import { parsearPeriodo } from '../reports/periodo';

export type ComandoEspecial = 'resumen' | 'cobros' | 'ayuda' | 'pago' | 'reporte' | 'eliminar';

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const tieneMes = (s: string) => MESES_ES.some((m) => s.includes(m));

/**
 * Detecta comandos especiales que NO pasan por Claude (ahorra tokens y latencia).
 */
export function detectarComando(texto: string): ComandoEspecial | null {
  const t = texto.trim().toLowerCase();
  if (t === 'resumen' || t === 'saldo') return 'resumen';
  // Resumen histórico: "resumen mayo", "saldo de enero 2025"
  if ((t.startsWith('resumen') || t.startsWith('saldo')) && tieneMes(t)) return 'resumen';
  if (t === 'cobros' || t === 'pendientes') return 'cobros';
  if (t === 'ayuda' || t === 'help' || t === 'menu' || t === 'menú') return 'ayuda';
  if (
    t === 'pagar' ||
    t === 'suscribirme' ||
    t === 'suscribir' ||
    t === 'suscripción' ||
    t === 'suscripcion' ||
    t === 'plan' ||
    t === 'premium'
  ) {
    return 'pago';
  }
  if (t === 'reporte' || t.startsWith('reporte ') || t === 'informe' || t.startsWith('informe ') || t === 'exportar') {
    return 'reporte';
  }
  if (t === 'deshacer' || t === 'undo' || t === 'borra el último' || t === 'borrar último' || t === 'eliminar último') {
    return 'eliminar';
  }
  return null;
}

const AYUDA = `🧮 *Abakus* — esto es lo que puedo hacer:

• Registra escribiendo natural: "vendí 50000 en diseño" o "pagué 12000 de luz".
• *resumen* o *saldo* → ingresos vs egresos del mes (o "resumen mayo" para otro mes).
• *cobros* o *pendientes* → tus cuentas por cobrar activas.
• *reporte* → Excel con detalle completo (o "reporte mayo").
• "Juan me pagó" → marca la deuda de Juan como cobrada.
• *deshacer* → borra el último movimiento registrado.
• Cuéntame una deuda: "Juan me debe 30000 para el 30/06".
• *plan* o *suscribirme* → activa tu suscripción.

¿En qué te ayudo?`;

export async function handleComando(
  user: Usuario,
  comando: ComandoEspecial,
  textoOriginal?: string,
): Promise<string> {
  if (comando === 'ayuda') {
    return AYUDA;
  }

  // 'pago', 'reporte' y 'eliminar' se gestionan en el handler directamente.

  if (comando === 'resumen') {
    const t = (textoOriginal ?? '').toLowerCase();
    if (tieneMes(t)) {
      const periodo = parsearPeriodo(t);
      const movs = await getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta);
      const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
      const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
      const balance = ingresos - egresos;
      return `📊 *Resumen ${periodo.label}*\n💰 Ingresos: ${clp(ingresos)}\n💸 Egresos: ${clp(egresos)}\n🧮 Balance: ${clp(balance)}\n\n_(${movs.length} movimiento${movs.length !== 1 ? 's' : ''})_`;
    }

    const { ingresos, egresos, balance } = await getResumenMes(user.phone);
    return `📊 *Resumen del mes*\n💰 Ingresos: ${clp(ingresos)}\n💸 Egresos: ${clp(egresos)}\n🧮 Balance: ${clp(balance)}`;
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
