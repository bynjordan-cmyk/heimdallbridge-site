import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config';

const BASE = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;

function authHeaders() {
  return { Authorization: `Bearer ${config.whatsapp.accessToken}` };
}

/**
 * Envía un mensaje de texto al usuario vía WhatsApp Cloud API.
 * `to` puede venir con o sin '+'; Meta espera el wa_id (sin '+').
 */
export async function sendText(to: string, body: string): Promise<void> {
  const recipient = to.replace(/^\+/, '');

  await axios.post(
    `${BASE}/messages`,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body },
    },
    {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      timeout: 10_000,
    },
  );
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
