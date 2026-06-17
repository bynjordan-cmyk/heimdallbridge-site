import { Request, Response } from 'express';
import { MensajeEntrante, WhatsAppWebhookBody } from '../types';
import { yaProcesado } from '../utils/idempotency';
import { getUsuarioByPhone, updateUsuario } from '../supabase/queries';
import { interpretar } from '../claude/interpreter';
import { sendText } from '../whatsapp/sender';
import { handleOnboarding } from '../flows/onboarding';
import { handleRegistro } from '../flows/registro';
import { detectarComando, handleComando } from '../flows/consulta';
import { handleReporte } from '../flows/reporte';
import { handleCargaMasiva, handlePlantilla } from '../flows/carga';
import {
  accesoVigente,
  esperandoEmail,
  esperandoPlan,
  iniciarSuscripcion,
  mensajeTrialVencido,
  procesarEmailSuscripcion,
  procesarSeleccionPlan,
} from '../flows/suscripcion';

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

  if (!message) return null;

  const phone = normalizarTelefono(message.from);
  const nombre = value?.contacts?.[0]?.profile?.name ?? null;

  if (message.type === 'document' && message.document?.id) {
    return {
      phone,
      texto: '',
      messageId: message.id,
      nombre,
      documento: {
        mediaId: message.document.id,
        filename: message.document.filename ?? 'archivo.xlsx',
        mimeType: message.document.mime_type ?? '',
      },
    };
  }

  if (message.type !== 'text' || !message.text?.body) {
    return null;
  }

  return {
    phone,
    texto: message.text.body,
    messageId: message.id,
    nombre,
    documento: null,
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

  // Flujo de suscripción: email → plan → link de pago.
  if (esperandoEmail(usuario)) {
    const respuesta = await procesarEmailSuscripcion(usuario, mensaje.texto);
    await sendText(mensaje.phone, respuesta);
    return;
  }
  if (esperandoPlan(usuario)) {
    const respuesta = await procesarSeleccionPlan(usuario, mensaje.texto);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Carga masiva: el usuario envió un documento Excel.
  if (mensaje.documento) {
    if (!accesoVigente(usuario)) {
      await sendText(mensaje.phone, mensajeTrialVencido());
      return;
    }
    await sendText(mensaje.phone, '📥 Recibí tu archivo, procesando la carga masiva...');
    const respuesta = await handleCargaMasiva(usuario, mensaje.documento);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Comandos especiales: no pasan por Claude.
  const comando = detectarComando(mensaje.texto);
  if (comando === 'pago') {
    const respuesta = await iniciarSuscripcion(usuario);
    await sendText(mensaje.phone, respuesta);
    return;
  }
  if (comando === 'reporte') {
    await sendText(mensaje.phone, '📊 Generando tu reporte, un momento...');
    await handleReporte(usuario, mensaje.texto);
    return;
  }
  if (comando === 'plantilla') {
    await handlePlantilla(usuario);
    return;
  }
  if (comando === 'eliminar') {
    // Comando directo de deshacer: no requiere Claude.
    const { eliminarUltimoMovimiento } = await import('../supabase/queries');
    const { clp } = await import('../utils/format');
    const mov = await eliminarUltimoMovimiento(usuario.phone);
    if (!mov) {
      await sendText(mensaje.phone, 'No encontré movimientos recientes para borrar 🤔');
    } else {
      const detalle = [clp(Number(mov.monto)), mov.categoria, mov.descripcion].filter(Boolean).join(' | ');
      await sendText(mensaje.phone, `🗑️ Borré el último movimiento:\n${mov.tipo === 'ingreso' ? '💰' : '💸'} ${detalle}`);
    }
    return;
  }
  if (comando) {
    const respuesta = await handleComando(usuario, comando, mensaje.texto);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Interpretación con Claude (le pasamos el nombre conocido para que lo use).
  const interp = await interpretar(mensaje.texto, { nombre: usuario.nombre });

  // Persistir nombre si el usuario lo declara o pide un apodo distinto al guardado.
  if (interp.nombre && interp.nombre !== usuario.nombre) {
    await updateUsuario(usuario.phone, { nombre: interp.nombre });
    usuario.nombre = interp.nombre;
  }

  // cobro y eliminar detectados por Claude también pasan por handleRegistro.
  const esAccionDatos = interp.tipo === 'ingreso' || interp.tipo === 'egreso' ||
    interp.tipo === 'deuda' || interp.tipo === 'cobro' || interp.tipo === 'eliminar';

  // Candado de trial: solo bloquea nuevos registros (ingreso/egreso/deuda).
  const requiereAcceso = interp.tipo === 'ingreso' || interp.tipo === 'egreso' || interp.tipo === 'deuda';
  if (requiereAcceso && !accesoVigente(usuario)) {
    await sendText(mensaje.phone, mensajeTrialVencido());
    return;
  }

  let respuesta: string;
  if (esAccionDatos) {
    respuesta = await handleRegistro(usuario, interp, mensaje.texto);
  } else {
    // 'consulta' | 'desconocido' → usamos la respuesta del modelo.
    respuesta = interp.respuesta;
  }

  await sendText(mensaje.phone, respuesta);
}
