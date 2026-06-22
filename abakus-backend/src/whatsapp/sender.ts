import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config';

const BASE = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;

// WhatsApp rechaza textos de más de 4096 caracteres. Dividimos con margen.
const MAX_LEN = 3900;

function authHeaders() {
  return { Authorization: `Bearer ${config.whatsapp.accessToken}` };
}

/**
 * Divide un texto largo en partes <= max, prefiriendo cortar en salto de línea
 * o espacio para no partir palabras/líneas a la mitad.
 */
function dividirMensaje(texto: string, max: number): string[] {
  if (texto.length <= max) return texto.trim().length ? [texto] : [];
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max);
    if (corte < max * 0.5) corte = max; // sin buen punto de corte: corta duro
    partes.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).trimStart();
  }
  if (resto.trim().length) partes.push(resto);
  return partes;
}

/**
 * Envía un mensaje de texto al usuario vía WhatsApp Cloud API.
 * `to` puede venir con o sin '+'; Meta espera el wa_id (sin '+').
 * Si el texto supera el límite de WhatsApp, se envía en varias partes ordenadas.
 */
export async function sendText(to: string, body: string): Promise<void> {
  const recipient = to.replace(/^\+/, '');
  const partes = dividirMensaje(body ?? '', MAX_LEN);

  for (const parte of partes) {
    await axios.post(
      `${BASE}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: parte },
      },
      {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        timeout: 10_000,
      },
    );
  }
}

/**
 * Descarga un media de WhatsApp por su media_id (URL temporal + bytes con auth).
 */
export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const { data: meta } = await axios.get<{ url: string }>(
    `https://graph.facebook.com/${config.whatsapp.graphVersion}/${mediaId}`,
    { headers: authHeaders(), timeout: 10_000 },
  );

  const { data } = await axios.get<ArrayBuffer>(meta.url, {
    headers: authHeaders(),
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: 20 * 1024 * 1024, // 20 MB
  });

  return Buffer.from(data);
}

/**
 * Sube un buffer como media a WhatsApp y devuelve el media_id.
 */
async function uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', buffer, { filename, contentType: mimeType });

  const { data } = await axios.post<{ id: string }>(`${BASE}/media`, form, {
    headers: { ...authHeaders(), ...form.getHeaders() },
    timeout: 30_000,
    maxBodyLength: 20 * 1024 * 1024, // 20 MB
  });

  return data.id;
}

/**
 * Envía un documento (Excel, PDF, etc.) al usuario via WhatsApp.
 * Sube el buffer al Media API de Meta y luego lo envía como documento.
 */
export async function sendDocument(
  to: string,
  buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  const recipient = to.replace(/^\+/, '');
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const mediaId = await uploadMedia(buffer, filename, mimeType);

  await axios.post(
    `${BASE}/messages`,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'document',
      document: {
        id: mediaId,
        filename,
        ...(caption ? { caption } : {}),
      },
    },
    {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      timeout: 10_000,
    },
  );
}
