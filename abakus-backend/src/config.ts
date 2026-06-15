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
  openai: {
    apiKey: required('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
  },
} as const;
