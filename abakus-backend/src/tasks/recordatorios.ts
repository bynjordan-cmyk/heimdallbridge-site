import { getUsuariosActivos, getCuentasPorVencer, marcarRecordatorioEnviado } from '../supabase/queries';
import { sendText } from '../whatsapp/sender';
import { accesoVigente } from '../flows/suscripcion';
import { clp } from '../utils/format';
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

      const lineas = cuentas.map((c) => {
        const dias = diasHasta(c.fecha_vencimiento!);
        const cuandoLabel = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
        return `• ${c.contraparte ?? 'Sin nombre'}: ${clp(Number(c.monto))} _(vence ${cuandoLabel})_`;
      }).join('\n');

      const plural = cuentas.length > 1 ? 'cuentas por cobrar que vencen' : 'cuenta por cobrar que vence';
      await sendText(
        user.phone,
        `⏰ *Recordatorio Abakus*\n\nTienes ${cuentas.length} ${plural} pronto:\n${lineas}\n\n¿Ya cobraste? Escríbeme "_[nombre] me pagó_" y lo marco al instante. 🙌`,
      );

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
