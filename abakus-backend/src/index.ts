import express from 'express';
import { config } from './config';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';

const app = express();
app.use(express.json());

// Healthcheck (Railway).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'abakus' });
});

// Webhook de WhatsApp Cloud API.
app.get(config.webhookPath, verifyWebhook);
app.post(config.webhookPath, handleWebhook);

app.listen(config.port, () => {
  console.log(`🧮 Abakus escuchando en puerto ${config.port} (${config.webhookPath})`);
});
