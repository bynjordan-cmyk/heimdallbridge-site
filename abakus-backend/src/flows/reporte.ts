import { Usuario } from '../types';
import { getMovimientosPeriodo, getCuentasPendientes } from '../supabase/queries';
import { generarReporteExcel } from '../reports/excel';
import { parsearPeriodo } from '../reports/periodo';
import { sendText, sendDocument } from '../whatsapp/sender';

/**
 * Genera y envía el reporte Excel al usuario.
 * Se llama después de enviar el mensaje "Generando tu reporte...".
 */
export async function handleReporte(user: Usuario, textoOriginal: string): Promise<void> {
  const periodo = parsearPeriodo(textoOriginal);

  const [movimientos, cuentas] = await Promise.all([
    getMovimientosPeriodo(user.phone, periodo.desde, periodo.hasta),
    getCuentasPendientes(user.phone),
  ]);

  const buffer = await generarReporteExcel(movimientos, cuentas, periodo, user.nombre);

  const filename = `abakus-reporte-${periodo.label.toLowerCase().replace(' ', '-')}.xlsx`;

  await sendDocument(
    user.phone,
    buffer,
    filename,
    `📊 Tu reporte financiero de ${periodo.label} · ${movimientos.length} movimiento${movimientos.length !== 1 ? 's' : ''}`,
  );

  const totalIngresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movimientos
    .filter((m) => m.tipo === 'egreso')
    .reduce((s, m) => s + Number(m.monto), 0);
  const balance = totalIngresos - totalEgresos;

  const signo = balance >= 0 ? '+' : '';
  await sendText(
    user.phone,
    `✅ Reporte de *${periodo.label}* listo.\n\n` +
      `💰 Ingresos: $${Math.round(totalIngresos).toLocaleString('es-CL')}\n` +
      `💸 Egresos: $${Math.round(totalEgresos).toLocaleString('es-CL')}\n` +
      `🧮 Balance: ${signo}$${Math.round(Math.abs(balance)).toLocaleString('es-CL')}`,
  );
}
