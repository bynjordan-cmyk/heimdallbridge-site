import { tareaCorrioHoy, marcarTareaCorrida } from '../supabase/queries';
import { enviarTipDiario } from './tips';
import { enviarRecordatorios } from './recordatorios';

// Scheduler auto-sanable para las tareas diarias (recordatorios 9 AM, tip 15:00).
//
// node-cron dispara dentro del proceso; si Railway reinicia o duerme el
// contenedor a esa hora, el tick se pierde y no se recupera. Para que el envío
// diario sea CONFIABLE, además del cron llamamos a `correrTareasPendientes()` en
// cada mensaje entrante y al arrancar: si ya pasó la hora y la tarea no corrió
// hoy, se ejecuta. La marca por día vive en `tareas_diarias` (persistente), así
// no se duplica entre reinicios ni entre el cron y los webhooks.

const TZ = 'America/Santiago';
const HORA_RECORDATORIOS = 9;
const HORA_TIP = 15;

/** Fecha (YYYY-MM-DD) y hora (0–23) actuales en zona horaria de Santiago. */
function ahoraSantiago(): { fecha: string; hora: number } {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const horaStr = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(ahora).find((p) => p.type === 'hour')?.value ?? '0';
  return { fecha, hora: Number(horaStr) % 24 };
}

let corriendo = false;

/**
 * Ejecuta las tareas diarias que correspondan según la hora de Santiago y que
 * aún no hayan corrido hoy. Idempotente (marca por día) y nunca lanza.
 */
export async function correrTareasPendientes(): Promise<void> {
  if (corriendo) return; // evita solapamiento dentro del mismo proceso
  corriendo = true;
  try {
    const { fecha, hora } = ahoraSantiago();

    if (hora >= HORA_RECORDATORIOS && !(await tareaCorrioHoy('recordatorios', fecha))) {
      await marcarTareaCorrida('recordatorios', fecha); // marca antes para no duplicar
      await enviarRecordatorios();
    }
    if (hora >= HORA_TIP && !(await tareaCorrioHoy('tip', fecha))) {
      await marcarTareaCorrida('tip', fecha);
      await enviarTipDiario();
    }
  } catch (err) {
    console.error('[abakus][scheduler] Error en tareas pendientes:', err);
  } finally {
    corriendo = false;
  }
}
