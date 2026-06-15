import { Request, Response } from 'express';
import { MensajeEntrante, WhatsAppWebhookBody } from '../types';
import { yaProcesado } from '../utils/idempotency';
import { getUsuarioByPhone } from '../supabase/queries';
import { interpretar } from '../claude/interpreter';
import { sendText } from '../whatsapp/sender';
import { handleOnboarding } from '../flows/onboarding';
import { handleRegistro } from '../flows/registro';
import { detectarComando, handleComando } from '../flows/consulta';
import { accesoVigente, mensajeTrialVencido } from '../flows/suscripcion';

const ERROR_GENERICO = 'Ups, algo salió mal 😅 Intenta de nuevo en un momento.';

/**
 * POST del webhook de Meta. Confirma recepción (< 5s) y procesa en background.
 */
export function handleWebhook(req: Request, res: Response): void {
  // Meta exige respuesta < 5s: confirmamos y procesamos de forma asíncrona.
  res.sendStatus(200);

  const mensaje = extraerMensaje(req.body as WhatsAppWebhookBody);
  if (!mensaje) return;

  void procesar(mensaje).catch(async (err) => {
    console.error('[abakus] Error procesando mensaje:', err);
    try {
      await sendText(mensaje.phone, ERROR_GENERICO);
    } catch (sendErr) {
      console.error('[abakus] Error enviando mensaje de error:', sendErr);
    }
  });
}

/**
 * Extrae un mensaje de texto real del payload. Ignora status updates y
 * cualquier tipo que no sea texto.
 */
function extraerMensaje(body: WhatsAppWebhookBody): MensajeEntrante | null {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (!message || message.type !== 'text' || !message.text?.body) {
    return null;
  }

  return {
    phone: normalizarTelefono(message.from),
    texto: message.text.body,
    messageId: message.id,
    nombre: value?.contacts?.[0]?.profile?.name ?? null,
  };
}

/** Normaliza a solo dígitos, sin '+' (ej: "+56935594094" -> "56935594094").
 *  Coincide con el formato que usa el flujo de n8n en las tablas Supabase. */
function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, '');
}

async function procesar(mensaje: MensajeEntrante): Promise<void> {
  if (yaProcesado(mensaje.messageId)) {
    return;
  }

  const usuario = await getUsuarioByPhone(mensaje.phone);

  // Usuario nuevo → onboarding (crea registro y envía bienvenida).
  if (!usuario) {
    const bienvenida = await handleOnboarding(mensaje.phone, mensaje.nombre);
    await sendText(mensaje.phone, bienvenida);
    return;
  }

  // Comandos especiales: no pasan por Claude.
  const comando = detectarComando(mensaje.texto);
  if (comando) {
    const respuesta = await handleComando(usuario, comando);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Interpretación con Claude.
  const interp = await interpretar(mensaje.texto);

  const esRegistro =
    interp.tipo === 'ingreso' || interp.tipo === 'egreso' || interp.tipo === 'deuda';

  // Candado de prueba: solo se bloquean los registros cuando la prueba expiró.
  // Consultas, saludos y el comando "suscribirme" siguen disponibles.
  if (esRegistro && !accesoVigente(usuario)) {
    await sendText(mensaje.phone, mensajeTrialVencido());
    return;
  }

  let respuesta: string;
  if (esRegistro) {
    respuesta = await handleRegistro(usuario, interp, mensaje.texto);
  } else {
    // 'consulta' | 'desconocido' → usamos la respuesta del modelo.
    respuesta = interp.respuesta;
  }

  await sendText(mensaje.phone, respuesta);
}
