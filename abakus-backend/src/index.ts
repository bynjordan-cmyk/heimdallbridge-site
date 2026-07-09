import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { handleMercadoPagoWebhook } from './webhook/mercadopago';
import { enviarTipDiario } from './tasks/tips';
import { correrTareasPendientes } from './tasks/scheduler';
import { generarReporteAprendizaje, renderHtmlAprendizaje } from './admin/reporteAprendizaje';
import { reunirDatosPanel, renderPanel } from './admin/panel';
import { ejecutarAccion, detalleUsuarioHtml } from './admin/acciones';
import { diagnosticarAviso } from './flows/reporteBug';

const app = express();
app.use(express.json());

// Commit y arranque, para saber QUÉ versión está desplegada (Railway expone
// RAILWAY_GIT_COMMIT_SHA automáticamente). Termina la duda "¿se desplegó?".
const VERSION = (process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev').slice(0, 7);
const ARRANCO_EN = new Date().toISOString();

// Healthcheck (Railway).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'abakus', version: VERSION, startedAt: ARRANCO_EN });
});

// Webhook de WhatsApp Cloud API.
app.get(config.webhookPath, verifyWebhook);
app.post(config.webhookPath, handleWebhook);

// Panel admin: salud del aprendizaje. Protegido por ADMIN_KEY (?key=...).
app.get('/admin/aprendizaje', (req, res) => {
  if (!config.adminKey) {
    res.status(404).send('Not found');
    return;
  }
  if (req.query.key !== config.adminKey) {
    res.status(403).send('Forbidden');
    return;
  }
  void generarReporteAprendizaje()
    .then((reporte) => {
      if (req.query.format === 'json') res.json(reporte);
      else res.send(renderHtmlAprendizaje(reporte));
    })
    .catch((err) => {
      console.error('[abakus][admin] Error generando reporte:', err);
      res.status(500).send('Error generando reporte');
    });
});

// Disparo manual del "Sabías que..." (para probar sin esperar el cron de las 15:00).
// Protegido por ADMIN_KEY (?key=...). Envía solo a quienes escribieron en las últimas 24h.
app.get('/admin/enviar-tip', (req, res) => {
  if (!config.adminKey) {
    res.status(404).send('Not found');
    return;
  }
  if (req.query.key !== config.adminKey) {
    res.status(403).send('Forbidden');
    return;
  }
  void enviarTipDiario()
    .then((enviados) => res.json({ ok: true, enviados }))
    .catch((err) => {
      console.error('[abakus][admin] Error enviando tip:', err);
      res.status(500).json({ ok: false, error: 'Error enviando tip' });
    });
});

// ===== Panel de control (GET /admin) =====
// Vista de administración con dashboard + gestión de usuarios. Protegido por
// ADMIN_KEY. Las mutaciones entran por POST /admin/api/accion validando la clave
// en el body (no en la URL, para no filtrarla en logs).

/** Valida ADMIN_KEY. Devuelve true si respondió (404/403); el caller corta. */
function bloqueaAdmin(clave: unknown, res: express.Response): boolean {
  if (!config.adminKey) {
    res.status(404).send('Not found');
    return true;
  }
  if (clave !== config.adminKey) {
    res.status(403).send('Forbidden');
    return true;
  }
  return false;
}

app.get('/admin', (req, res) => {
  if (bloqueaAdmin(req.query.key, res)) return;
  void reunirDatosPanel()
    .then((datos) => res.send(renderPanel(datos, String(req.query.key))))
    .catch((err) => {
      console.error('[abakus][admin] Error armando panel:', err);
      res.status(500).send('Error armando el panel');
    });
});

// Detalle de un usuario (fragmento HTML para el modal del panel).
app.get('/admin/api/usuario', (req, res) => {
  if (bloqueaAdmin(req.query.key, res)) return;
  const phone = String(req.query.phone ?? '');
  void detalleUsuarioHtml(phone)
    .then((html) => res.send(html))
    .catch((err) => {
      console.error('[abakus][admin] Error en detalle:', err);
      res.status(500).send('<p>Error cargando el detalle.</p>');
    });
});

// Acción sobre un usuario (cambiar plan, extender prueba, activar/desactivar).
app.post('/admin/api/accion', (req, res) => {
  const body = (req.body ?? {}) as { key?: unknown; phone?: unknown; accion?: unknown; valor?: unknown };
  if (bloqueaAdmin(body.key, res)) return;
  void ejecutarAccion(String(body.accion ?? ''), String(body.phone ?? ''), String(body.valor ?? ''))
    .then((r) => res.json(r))
    .catch((err) => {
      console.error('[abakus][admin] Error ejecutando acción:', err);
      res.status(500).json({ ok: false, mensaje: 'Error ejecutando la acción' });
    });
});

// Diagnóstico de avisos: intenta enviar un WhatsApp de prueba a ADMIN_PHONE y
// devuelve el resultado real (incluido el error de Meta). Para depurar por qué
// no llegan los avisos de reporte de bug.
app.get('/admin/test-aviso', (req, res) => {
  if (bloqueaAdmin(req.query.key, res)) return;
  void diagnosticarAviso()
    .then((r) => res.json(r))
    .catch((err) => {
      console.error('[abakus][admin] Error en test-aviso:', err);
      res.status(500).json({ ok: false, detalle: 'Error ejecutando el diagnóstico' });
    });
});

// Webhook de Mercado Pago (notificaciones de pago/suscripción).
app.post('/webhook/mercadopago', handleMercadoPagoWebhook);

// Página de retorno tras el pago (back_url de Mercado Pago).
app.get('/gracias', (_req, res) => {
  res.send(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abakus</title></head><body style="font-family:system-ui;text-align:center;padding:48px 24px;color:#1a1a1a"><h1>🎉 ¡Gracias!</h1><p>Tu suscripción a <b>Abakus 🧮</b> está siendo procesada.</p><p>Vuelve a WhatsApp — te confirmaremos por ahí apenas se active. 📲</p></body></html>`,
  );
});

// Tareas diarias (recordatorios 9 AM, tip 15:00, hora Santiago). El cron es el
// disparo principal; correrTareasPendientes() marca por día para no duplicar.
// La confiabilidad real la dan, además, el catch-up al arrancar y el disparo en
// cada mensaje entrante (ver tasks/scheduler.ts), por si Railway reinició/durmió.
cron.schedule('0 9,15 * * *', () => void correrTareasPendientes(), {
  timezone: 'America/Santiago',
});

app.listen(config.port, () => {
  console.log(`🧮 Abakus escuchando en puerto ${config.port} (${config.webhookPath}) · versión ${VERSION}`);
  // Catch-up: si el proceso arrancó después de la hora de una tarea no enviada hoy.
  void correrTareasPendientes();
});
