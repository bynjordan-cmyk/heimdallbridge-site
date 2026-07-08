import { Usuario } from '../types';
import { config } from '../config';
import { insertReporte, updateUsuario } from '../supabase/queries';
import { sendText } from '../whatsapp/sender';

// Reporte de bug / soporte desde WhatsApp. El usuario escribe "reportar" (con o
// sin el detalle en el mismo mensaje); Abakus guarda el reporte y se lo reenvía
// al equipo por WhatsApp (config.adminPhone). Si no trae detalle, lo pide.

const ESTADO = 'reportando_bug';

/** ¿El usuario está escribiendo el detalle de su reporte? */
export function esperandoReporte(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO;
}

/** Quita las palabras gatillo del inicio para quedarse con el cuerpo del reporte. */
function cuerpoInline(texto: string): string {
  return texto
    .replace(
      /^\s*(reportar(\s+un)?(\s+(bug|problema|error|falla))?|reporte\s+de\s+bug|tengo\s+un\s+(problema|error|bug)|quiero\s+reportar|soporte)\s*[:,.\-]?\s*/i,
      '',
    )
    .trim();
}

/**
 * Paso 1: si el mensaje ya trae el detalle ("reportar el #N no aparece"), lo
 * registra directo; si no, pide el detalle y deja al usuario en estado de reporte.
 */
export async function iniciarReporte(user: Usuario, textoOriginal: string): Promise<string> {
  const cuerpo = cuerpoInline(textoOriginal);
  if (cuerpo.length >= 8) {
    return finalizarReporte(user, cuerpo);
  }
  await updateUsuario(user.phone, { estado_conversacion: ESTADO });
  user.estado_conversacion = ESTADO;
  return '🐞 Cuéntame qué pasó, con el mayor detalle posible: qué hiciste, qué esperabas y qué salió mal. (Escribe *cancelar* si cambiaste de opinión.)';
}

/** Paso 2: recibe el detalle, lo guarda y avisa al equipo. Siempre limpia el estado. */
export async function procesarReporte(user: Usuario, texto: string): Promise<string> {
  await updateUsuario(user.phone, { estado_conversacion: null });
  user.estado_conversacion = null;

  const t = texto.trim();
  if (/^(cancelar|cancela|olvídalo|olvidalo|nada)$/i.test(t)) {
    return 'Listo, cancelé el reporte 👍';
  }
  if (t.length < 3) {
    return 'No alcancé a leer el detalle 🤔 Escribe *reportar* de nuevo cuando quieras contarme.';
  }
  return finalizarReporte(user, t);
}

async function finalizarReporte(user: Usuario, mensaje: string): Promise<string> {
  await insertReporte({ userPhone: user.phone, nombre: user.nombre, mensaje, version: config.version });
  await notificarEquipo(user, mensaje).catch((e) =>
    console.error('[abakus][reporte] No se pudo avisar al equipo:', e),
  );
  return '🙏 ¡Gracias por avisar! Registré tu reporte y ya lo estamos revisando. Si necesitamos más info, te escribimos por aquí.';
}

async function notificarEquipo(user: Usuario, mensaje: string): Promise<void> {
  if (!config.adminPhone) return; // sin número configurado: el reporte igual queda guardado
  const quien = user.nombre ? `${user.nombre} (${user.phone})` : user.phone;
  const aviso = `🐞 *Nuevo reporte de Abakus*\n👤 ${quien}\n🏷️ Versión: ${config.version}\n\n"${mensaje}"`;
  await sendText(config.adminPhone, aviso);
}
