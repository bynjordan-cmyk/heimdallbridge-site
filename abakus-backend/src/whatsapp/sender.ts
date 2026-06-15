import axios from 'axios';
import { config } from '../config';

const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;

/**
 * Envía un mensaje de texto al usuario vía WhatsApp Cloud API.
 * `to` puede venir con o sin '+'; Meta espera el wa_id (sin '+').
 */
export async function sendText(to: string, body: string): Promise<void> {
  const recipient = to.replace(/^\+/, '');

  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  );
}
