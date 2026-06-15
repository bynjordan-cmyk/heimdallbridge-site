import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  webhookPath: process.env.WEBHOOK_PATH ?? '/webhook/abakus-whatsapp',
  whatsapp: {
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? 'v22.0',
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
  },
  pago: {
    // Link estático de Mercado Pago (fallback simple). Opcional.
    mercadopagoLink: process.env.MERCADOPAGO_LINK ?? '',
    // Integración por API (detección automática del pago).
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    precio: Number(process.env.MERCADOPAGO_PRECIO ?? 0), // monto mensual (ej: 4990)
    moneda: process.env.MERCADOPAGO_MONEDA ?? 'CLP',
    motivo: process.env.MERCADOPAGO_MOTIVO ?? 'Suscripción Abakus 🧮',
    // URL pública del backend (para back_url y notification_url de MP).
    publicUrl: process.env.PUBLIC_URL ?? '',
  },
} as const;
