import { getUsuariosActivos, getCuentasPorVencer, marcarRecordatorioEnviado } from '../supabase/queries';
import { sendText } from '../whatsapp/sender';
import { accesoVigente } from '../flows/suscripcion';
import { formatMonto } from '../utils/format';
import { Usuario } from '../types';

const DIAS_AVISO = 3;

function elegibleParaRecordatorio(user: Usuario): boolean {
  // Pro: siempre. Trial activo: también (muestra valor). Básico: no.
  if (user.plan === 'pro' || user.plan === 'premium') return true;
  if (user.plan === 'basico') return false;
  // Sin plan = trial: solo si sigue vigente
  return accesoVigente(user);
}

export async function enviarRecordatorios(): Promise<void> {
  const usuarios = await getUsuariosActivos();
  const elegibles = usuarios.filter(elegibleParaRecordatorio);

  let enviados = 0;
  for (const user of elegibles) {
    try {
      const cuentas = await getCuentasPorVencer(user.phone, DIAS_AVISO);
      if (cuentas.length === 0) continue;

      const porCobrar = cuentas.filter((c) => c.tipo !== 'por_pagar');
      const porPagar = cuentas.filter((c) => c.tipo === 'por_pagar');

      const linea = (c: (typeof cuentas)[number]) => {
        const dias = diasHasta(c.fecha_vencimiento!);
        const cuandoLabel = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
        return `• ${c.contraparte ?? 'Sin nombre'}: ${formatMonto(Number(c.monto), user.moneda)} _(vence ${cuandoLabel})_`;
      };

      let cuerpo = '';
      if (porCobrar.length > 0) {
        const t = porCobrar.length > 1 ? 'cuentas por cobrar' : 'cuenta por cobrar';
        cuerpo += `\n💰 *Por cobrar* (${porCobrar.length} ${t}):\n${porCobrar.map(linea).join('\n')}\n¿Ya cobraste? Escríbeme "_[nombre] me pagó_". 🙌\n`;
      }
      if (porPagar.length > 0) {
        const t = porPagar.length > 1 ? 'cuentas por pagar' : 'cuenta por pagar';
        cuerpo += `\n📌 *Por pagar* (${porPagar.length} ${t}):\n${porPagar.map(linea).join('\n')}\n¿Ya pagaste? Escríbeme "_ya le pagué a [nombre]_". ✅\n`;
      }

      await sendText(user.phone, `⏰ *Recordatorio Abakus*\nTienes movimientos que vencen pronto:\n${cuerpo}`);

      for (const c of cuentas) {
        await marcarRecordatorioEnviado(c.id);
      }
      enviados++;
    } catch (err) {
      console.error(`[abakus][recordatorio] Error para ${user.phone}:`, err);
    }
  }

  console.log(`[abakus][recordatorio] Enviados: ${enviados}/${elegibles.length} usuarios revisados`);
}

function diasHasta(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fecha + 'T00:00:00');
  return Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);
}
