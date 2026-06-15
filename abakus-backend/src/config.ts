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
} as const;
