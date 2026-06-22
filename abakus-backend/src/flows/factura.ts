import { DocumentoEntrante, MovimientoInterpretado, Usuario } from '../types';
import { downloadMedia } from '../whatsapp/sender';
import { extraerFactura } from '../claude/factura';
import { updateUsuario } from '../supabase/queries';
import { formatMonto } from '../utils/format';

const ESTADO = 'confirmar_factura';
const MIME_PDF = 'application/pdf';

/** ¿El documento entrante es una factura/boleta (imagen o PDF), no un Excel? */
export function esFactura(doc: DocumentoEntrante): boolean {
  return doc.mimeType.startsWith('image/') || doc.mimeType === MIME_PDF;
}

/** ¿El usuario está confirmando una factura leída? */
export function esperandoConfirmacionFactura(user: Usuario): boolean {
  return user.estado_conversacion === ESTADO;
}

export function esAfirmacionFactura(texto: string): boolean {
  return /^(s[ií]|ok|oka|dale|ya|listo|correcto|confirm|registr|guarda|añade|agrega|👍|👌|✅)/i.test(
    texto.trim().toLowerCase(),
  );
}

export function esNegacionFactura(texto: string): boolean {
  return /^(no|cancel|descart|borra|elimina|olv[ií]d|d[eé]jal)/i.test(texto.trim().toLowerCase());
}

/**
 * Lee una factura/boleta (foto o PDF), guarda lo extraído como pendiente de
 * confirmación y devuelve el resumen para que el usuario confirme.
 */
export async function handleFactura(user: Usuario, doc: DocumentoEntrante): Promise<string> {
  let buffer: Buffer;
  try {
    buffer = await downloadMedia(doc.mediaId);
  } catch (err) {
    console.error('[abakus][factura] Error descargando archivo:', err);
    return '😅 No pude descargar tu archivo. ¿Lo reenvías?';
  }

  const factura = await extraerFactura(buffer, doc.mimeType);
  if (!factura.legible || factura.movimientos.length === 0) {
    return `🧾 ${factura.resumen}\n\nProba con una foto más nítida (que se vea el total y la fecha), o escríbeme el gasto a mano (ej. "gasté 23490 en el super").`;
  }

  // El proveedor sirve de descripción si no hay una.
  const items: MovimientoInterpretado[] = factura.movimientos.map((m) => ({
    ...m,
    descripcion: m.descripcion ?? factura.proveedor,
  }));

  await updateUsuario(user.phone, { estado_conversacion: ESTADO, pendiente: items });
  user.estado_conversacion = ESTADO;
  user.pendiente = items;

  const f = (n: number) => formatMonto(n, user.moneda);
  const lineas = items
    .map((m) => {
      const cat = m.categoria ? ` · ${m.categoria}` : ' · Sin clasificar';
      const fecha = m.fecha ? ` · ${m.fecha}` : '';
      return `${m.tipo === 'ingreso' ? '💰' : '💸'} ${f(m.monto)}${cat}${fecha}`;
    })
    .join('\n');
  const prov = factura.proveedor ? `\n🏪 ${factura.proveedor}` : '';

  return `🧾 Leí tu factura:\n${lineas}${prov}\n\n¿La registro? Responde *sí* para confirmar o *no* para descartar.`;
}
