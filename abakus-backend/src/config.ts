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
    precioBasico: Number(process.env.MERCADOPAGO_PRECIO_PLAN_BASICO ?? 0),
    precioPro: Number(process.env.MERCADOPAGO_PRECIO_PLAN_PRO ?? 0),
    moneda: process.env.MERCADOPAGO_MONEDA ?? 'CLP',
    // URL pública del backend (para back_url y notification_url de MP).
    publicUrl: (process.env.PUBLIC_URL ?? '').trim(),
  },
  // Clave para el panel de administración (/admin/*). Si está vacía, el panel
  // queda deshabilitado.
  adminKey: (process.env.ADMIN_KEY ?? '').trim(),
  // Número (E.164, ej. +56912345678) que recibe por WhatsApp los reportes de bug
  // de los usuarios. Vacío = no se envía aviso (el reporte igual queda guardado).
  adminPhone: (process.env.ADMIN_PHONE ?? '').trim(),
  // Commit desplegado (Railway lo expone). Se adjunta a los reportes de bug para
  // saber en qué versión ocurrió.
  version: (process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev').slice(0, 7),
  // Días de prueba gratis para un usuario nuevo (desde su alta). 0 = sin trial
  // (acceso libre). Los usuarios previos sin fecha quedan con acceso libre.
  trialDias: Number(process.env.TRIAL_DIAS ?? 14),
} as const;
