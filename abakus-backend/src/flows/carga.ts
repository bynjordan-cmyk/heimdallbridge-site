import { DocumentoEntrante, Usuario } from '../types';
import { downloadMedia, sendDocument } from '../whatsapp/sender';
import { parsearMovimientosExcel } from '../reports/importExcel';
import { generarPlantillaExcel } from '../reports/excel';
import { insertMovimientosMasivo } from '../supabase/queries';
import { formatMonto } from '../utils/format';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_ERRORES_MOSTRADOS = 5;

function esXlsx(doc: DocumentoEntrante): boolean {
  return doc.filename.toLowerCase().endsWith('.xlsx') || doc.mimeType === MIME_XLSX;
}

/** Procesa un documento Excel enviado por WhatsApp y carga sus movimientos en lote. */
export async function handleCargaMasiva(user: Usuario, doc: DocumentoEntrante): Promise<string> {
  if (!esXlsx(doc)) {
    return '📄 Por ahora solo puedo leer archivos *.xlsx* (Excel). Escribe *plantilla* para descargar el formato correcto.';
  }

  let buffer: Buffer;
  try {
    buffer = await downloadMedia(doc.mediaId);
  } catch (err) {
    console.error('[abakus][carga] Error descargando archivo:', err);
    return '😅 No pude descargar tu archivo. ¿Puedes intentar enviarlo de nuevo?';
  }

  const { validos, errores } = await parsearMovimientosExcel(buffer);

  if (validos.length === 0) {
    const detalle = errores.slice(0, MAX_ERRORES_MOSTRADOS).join('\n');
    return `🤔 No encontré movimientos válidos en tu archivo.\n\n${
      detalle || 'Revisa que tenga las columnas Fecha, Tipo, Monto, Categoría y Descripción.'
    }\n\nEscribe *plantilla* para descargar el formato correcto.`;
  }

  await insertMovimientosMasivo(user.phone, validos);

  const ingresos = validos.filter((m) => m.tipo === 'ingreso');
  const egresos = validos.filter((m) => m.tipo === 'egreso');
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
  const totalEgresos = egresos.reduce((s, m) => s + m.monto, 0);

  const f = (n: number) => formatMonto(n, user.moneda);
  let msg = `✅ *Carga masiva completa*\n\n📥 ${validos.length} movimiento${validos.length !== 1 ? 's' : ''} registrado${validos.length !== 1 ? 's' : ''}\n💰 Ingresos: ${f(totalIngresos)} (${ingresos.length})\n💸 Egresos: ${f(totalEgresos)} (${egresos.length})`;

  if (errores.length > 0) {
    const detalle = errores.slice(0, MAX_ERRORES_MOSTRADOS).join('\n');
    msg += `\n\n⚠️ ${errores.length} fila${errores.length !== 1 ? 's' : ''} con problemas:\n${detalle}`;
    if (errores.length > MAX_ERRORES_MOSTRADOS) {
      msg += `\n_(y ${errores.length - MAX_ERRORES_MOSTRADOS} más)_`;
    }
  }

  msg += `\n\nEscribe *resumen* para ver tu balance actualizado.`;
  return msg;
}

/** Genera y envía la plantilla Excel para que el usuario la complete y reenvíe. */
export async function handlePlantilla(user: Usuario): Promise<void> {
  const buffer = await generarPlantillaExcel();
  await sendDocument(
    user.phone,
    buffer,
    'abakus-plantilla-carga.xlsx',
    '📥 Completa esta plantilla y envíamela de vuelta por WhatsApp para cargar varios movimientos de una vez.',
  );
}
