import { Usuario } from '../types';
import { getCuentasPendientes, getResumenMes } from '../supabase/queries';
import { clp } from '../utils/format';

export type ComandoEspecial = 'resumen' | 'cobros' | 'ayuda';

/**
 * Detecta comandos especiales que NO pasan por Claude (ahorra tokens y latencia).
 */
export function detectarComando(texto: string): ComandoEspecial | null {
  const t = texto.trim().toLowerCase();
  if (t === 'resumen' || t === 'saldo') return 'resumen';
  if (t === 'cobros' || t === 'pendientes') return 'cobros';
  if (t === 'ayuda' || t === 'help' || t === 'menu' || t === 'menú') return 'ayuda';
  return null;
}

const AYUDA = `🧮 *Abakus* — esto es lo que puedo hacer:

• Registra escribiendo natural, ej: "vendí 50000 en diseño" o "pagué 12000 de luz".
• *resumen* o *saldo* → ingresos vs egresos del mes.
• *cobros* o *pendientes* → tus cuentas por cobrar.
• Cuéntame una deuda: "Juan me debe 30000 para el 30/06".

¿En qué te ayudo?`;

export async function handleComando(user: Usuario, comando: ComandoEspecial): Promise<string> {
  if (comando === 'ayuda') {
    return AYUDA;
  }

  if (comando === 'resumen') {
    const { ingresos, egresos, balance } = await getResumenMes(user.id);
    return `📊 *Resumen del mes*
💰 Ingresos: ${clp(ingresos)}
💸 Egresos: ${clp(egresos)}
🧮 Balance: ${clp(balance)}`;
  }

  // comando === 'cobros'
  const cuentas = await getCuentasPendientes(user.id);
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
