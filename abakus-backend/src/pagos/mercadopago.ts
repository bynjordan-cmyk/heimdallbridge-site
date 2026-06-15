import axios from 'axios';
import { config } from '../config';

const API = 'https://api.mercadopago.com';

/** ¿Está configurada la integración por API de Mercado Pago? */
export function mpConfigurado(): boolean {
  return Boolean(config.pago.accessToken && config.pago.precio > 0 && config.pago.publicUrl);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${config.pago.accessToken}`,
    'Content-Type': 'application/json',
  };
}

interface PreapprovalResponse {
  id: string;
  init_point: string;
  status: string;
  external_reference?: string;
  payer_email?: string;
}

/**
 * Crea una suscripción (preapproval) sin plan asociado. El usuario define su
 * medio de pago en el checkout (status 'pending'). external_reference lleva el
 * teléfono para que el webhook sepa a quién activar.
 * Devuelve el init_point (URL de checkout).
 */
export async function crearSuscripcion(phone: string, email: string): Promise<string> {
  const body = {
    reason: config.pago.motivo,
    external_reference: phone,
    payer_email: email,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: config.pago.precio,
      currency_id: config.pago.moneda,
    },
    back_url: `${config.pago.publicUrl}/gracias`,
    status: 'pending',
  };

  const { data } = await axios.post<PreapprovalResponse>(`${API}/preapproval`, body, {
    headers: authHeaders(),
    timeout: 15_000,
  });

  return data.init_point;
}

/** Consulta una suscripción por id. */
export async function getPreapproval(id: string): Promise<PreapprovalResponse> {
  const { data } = await axios.get<PreapprovalResponse>(`${API}/preapproval/${id}`, {
    headers: authHeaders(),
    timeout: 15_000,
  });
  return data;
}

interface PaymentResponse {
  id: number;
  status: string;
  external_reference?: string;
}

/** Consulta un pago por id (notificaciones tipo 'payment'). */
export async function getPayment(id: string): Promise<PaymentResponse> {
  const { data } = await axios.get<PaymentResponse>(`${API}/v1/payments/${id}`, {
    headers: authHeaders(),
    timeout: 15_000,
  });
  return data;
}
