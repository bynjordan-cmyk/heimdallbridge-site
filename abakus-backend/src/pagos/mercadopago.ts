import axios from 'axios';
import { config } from '../config';

const API = 'https://api.mercadopago.com';

export type PlanAbakus = 'basico' | 'pro';

/** ¿Está configurada la integración por API de Mercado Pago? */
export function mpConfigurado(): boolean {
  return Boolean(
    config.pago.accessToken &&
      (config.pago.precioBasico > 0 || config.pago.precioPro > 0) &&
      config.pago.publicUrl,
  );
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
 * Crea una suscripción (preapproval). external_reference lleva "{phone}|{plan}"
 * para que el webhook sepa a quién activar y con qué plan.
 * Devuelve el init_point (URL de checkout).
 */
export async function crearSuscripcion(
  phone: string,
  email: string,
  plan: PlanAbakus,
): Promise<string> {
  const precio = plan === 'pro' ? config.pago.precioPro : config.pago.precioBasico;
  const motivo = plan === 'pro' ? 'Abakus Plan Pro 🧮' : 'Abakus Plan Básico 🧮';

  const body = {
    reason: motivo,
    external_reference: `${phone}|${plan}`,
    payer_email: email,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: precio,
      currency_id: config.pago.moneda,
    },
    back_url: `${config.pago.publicUrl}/gracias`,
    status: 'pending',
  };

  const { data } = await axios.post<PreapprovalResponse>(`${API}/preapproval`, body, {
    headers: authHeaders(),
    timeout: 15_000,
  }).catch((err: unknown) => {
    if (axios.isAxiosError(err)) {
      console.error('[abakus][mp] Error API preapproval:', JSON.stringify(err.response?.data ?? err.message));
    }
    throw err;
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

/**
 * Parsea el external_reference que puede ser "{phone}|{plan}" o solo "{phone}"
 * (compatibilidad con suscripciones creadas antes de la migración).
 */
export function parsearExternalRef(ref: string): { phone: string; plan: PlanAbakus } {
  const parts = ref.split('|');
  const plan: PlanAbakus = parts[1] === 'pro' ? 'pro' : 'basico';
  return { phone: parts[0], plan };
}
