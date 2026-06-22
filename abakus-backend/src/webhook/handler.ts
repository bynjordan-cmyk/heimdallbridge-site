import { Request, Response } from 'express';
import { Interpretacion, MensajeEntrante, Usuario, WhatsAppWebhookBody } from '../types';
import { yaProcesado } from '../utils/idempotency';
import { getUsuarioByPhone, updateUsuario, agregarAprendizaje, touchUltimoMensaje, CuentasNoDisponibleError } from '../supabase/queries';
import { interpretar } from '../claude/interpreter';
import { construirPerfil } from '../aprendizaje/perfil';
import { historial, registrarTurno } from '../utils/contexto';
import { esMonedaSoportada, formatMonto } from '../utils/format';
import { sendText } from '../whatsapp/sender';
import { enOnboarding, iniciarOnboarding, invitacionPrimerRegistro } from '../flows/onboarding';
import { handleRegistro, registrarMovimientos } from '../flows/registro';
import { detectarComando, handleComando } from '../flows/consulta';
import { handleReporte } from '../flows/reporte';
import { handleCargaMasiva, handlePlantilla } from '../flows/carga';
import {
  esperandoCuenta,
  handleCrearCuenta,
  handleListarCuentas,
  handleTransferencia,
  limpiarPendiente,
  nombresCuentas,
  pedirCuenta,
  registrarPendientesEnCuenta,
  resolverCuentaPendiente,
} from '../flows/cuentas';
import { buscarCuenta, actualizarMovimiento } from '../supabase/queries';
import {
  correlativoEsperado,
  esNegativaCategoria,
  esperandoCategoria,
  limpiarEsperandoCategoria,
  pareceCategoria,
} from '../flows/clasificacion';
import {
  accesoVigente,
  descripcionPlanes,
  esperandoEmail,
  esperandoPlan,
  iniciarSuscripcion,
  mensajeTrialVencido,
  procesarEmailSuscripcion,
  procesarSeleccionPlan,
} from '../flows/suscripcion';

const ERROR_GENERICO = 'Ups, algo salió mal 😅 Intenta de nuevo en un momento.';
const ERROR_CUENTAS_NO_DISP =
  '🏦 El control de *cuentas y saldos* (bancos/caja) estará disponible muy pronto 🙌\n\nMientras tanto, registro tus ingresos, egresos y deudas sin problema. Escribe *resumen* para ver tu balance.';

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
    const respuesta = err instanceof CuentasNoDisponibleError ? ERROR_CUENTAS_NO_DISP : ERROR_GENERICO;
    try {
      await sendText(mensaje.phone, respuesta);
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

/** Normaliza a E.164 con '+' (ej: "56935594094" -> "+56935594094").
 *  Coincide con el formato que usa el flujo de n8n en las tablas Supabase, para
 *  reconocer a los usuarios existentes y no fragmentar su historial. El envío por
 *  Cloud API quita el '+' por su cuenta (whatsapp/sender.ts). */
function normalizarTelefono(raw: string): string {
  return '+' + raw.replace(/\D/g, '');
}

async function procesar(mensaje: MensajeEntrante): Promise<void> {
  if (yaProcesado(mensaje.messageId)) {
    return;
  }

  const usuario = await getUsuarioByPhone(mensaje.phone);

  // Usuario nuevo → onboarding guiado (crea registro y envía bienvenida + 1ª pregunta).
  if (!usuario) {
    const bienvenida = await iniciarOnboarding(mensaje.phone, mensaje.nombre);
    await sendText(mensaje.phone, bienvenida);
    return;
  }

  // Marca la ventana de 24h (mensajes proactivos: tip diario, recordatorios).
  // Fire-and-forget: no debe bloquear ni romper el procesamiento del mensaje.
  void touchUltimoMensaje(mensaje.phone);

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

  // Esperando que el usuario indique a qué cuenta van movimientos pendientes.
  if (esperandoCuenta(usuario)) {
    const resuelto = await resolverCuentaPendiente(usuario, mensaje.texto);
    if ('error' in resuelto) {
      await sendText(mensaje.phone, resuelto.error);
      return;
    }
    const items = resuelto.items.map((r) => r.item);
    await limpiarPendiente(usuario);
    const respuesta = await registrarPendientesEnCuenta(usuario, items, resuelto.cuenta);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Esperando la categoría de un movimiento recién registrado "Sin clasificar".
  // Determinista: el estado guarda el #correlativo; la respuesta se aplica a ese
  // movimiento, sin depender de que la IA infiera una corrección.
  if (esperandoCategoria(usuario)) {
    const corr = correlativoEsperado(usuario);
    const t = mensaje.texto.trim();
    if (esNegativaCategoria(t)) {
      await limpiarEsperandoCategoria(usuario);
      await sendText(mensaje.phone, 'Sin problema, lo dejo *Sin clasificar* 👍 Puedes clasificarlo luego con _"corrige el #N a [categoría]"_.');
      return;
    }
    if (corr != null && !detectarComando(t) && pareceCategoria(t)) {
      await limpiarEsperandoCategoria(usuario);
      const res = await actualizarMovimiento(usuario.phone, corr, { categoria: t });
      await sendText(
        mensaje.phone,
        res
          ? `🏷️ Listo, clasifiqué el movimiento #${corr} como *${res.actualizado.categoria ?? t}*.`
          : `No encontré el movimiento #${corr} 🤔`,
      );
      return;
    }
    // No parece categoría (comando o movimiento nuevo): limpiamos y seguimos el flujo normal.
    await limpiarEsperandoCategoria(usuario);
  }

  // Carga masiva: el usuario envió un documento Excel.
  if (mensaje.documento) {
    await salirDeOnboarding(usuario);
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
  if (comando) await salirDeOnboarding(usuario);
  if (comando === 'planes') {
    await sendText(mensaje.phone, descripcionPlanes());
    return;
  }
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
  if (comando === 'cuentas') {
    await sendText(mensaje.phone, await handleListarCuentas(usuario));
    return;
  }
  if (comando === 'eliminar') {
    // Comando directo de deshacer (último movimiento): no requiere Claude.
    const { eliminarMovimiento } = await import('../supabase/queries');
    const mov = await eliminarMovimiento(usuario.phone, null);
    if (!mov) {
      await sendText(mensaje.phone, 'No encontré movimientos recientes para borrar 🤔');
    } else {
      const ref = mov.correlativo != null ? ` #${mov.correlativo}` : '';
      const detalle = [formatMonto(Number(mov.monto), usuario.moneda), mov.categoria, mov.descripcion].filter(Boolean).join(' | ');
      await sendText(mensaje.phone, `🗑️ Borré el movimiento${ref}:\n${mov.tipo === 'ingreso' ? '💰' : '💸'} ${detalle}`);
    }
    return;
  }
  if (comando) {
    const respuesta = await handleComando(usuario, comando, mensaje.texto);
    await sendText(mensaje.phone, respuesta);
    return;
  }

  // Interpretación con Claude, alimentada con el perfil aprendido y el HISTORIAL
  // REAL de la conversación (turnos previos), para entender seguimientos sin
  // perder el hilo ni filtrar datos de conversaciones viejas.
  const [perfil, cuentas] = await Promise.all([
    construirPerfil(usuario),
    nombresCuentas(usuario.phone).catch(() => [] as string[]),
  ]);
  const historialPrevio = historial(usuario.phone);
  const interp = await interpretar(mensaje.texto, {
    nombre: usuario.nombre,
    perfil,
    moneda: usuario.moneda,
    cuentas,
    historial: historialPrevio,
  });

  const usaCuentas = cuentas.length > 0;

  // Persistir lo que Abakus aprendió de este mensaje (nombre, negocio, tono, memoria).
  await persistirAprendizaje(usuario, interp);

  // Ingresos/egresos detectados (1 o varios). Fallback: si el modelo marcó el
  // tipo pero no llenó el arreglo, armamos un item con los campos del nivel superior.
  let items = interp.movimientos;
  if (
    items.length === 0 &&
    (interp.tipo === 'ingreso' || interp.tipo === 'egreso') &&
    interp.monto != null
  ) {
    items = [{
      tipo: interp.tipo,
      monto: interp.monto,
      categoria: interp.categoria,
      descripcion: interp.descripcion,
      fecha: null,
      cuenta: interp.cuenta,
    }];
  }
  const tieneMovs = items.length > 0;

  // deuda, cobro, cuenta_pagar, saldar, eliminar, corregir, crear_cuenta y
  // transferencia también son "acción de datos" (no caen en consulta/onboarding).
  const esAccionDatos = tieneMovs || interp.tipo === 'deuda' || interp.tipo === 'cobro' ||
    interp.tipo === 'cuenta_pagar' || interp.tipo === 'saldar' ||
    interp.tipo === 'eliminar' || interp.tipo === 'corregir' ||
    interp.tipo === 'crear_cuenta' || interp.tipo === 'transferencia';

  // Onboarding paso 2: si está en el paso "¿a qué te dedicas?" y NO registró
  // nada, esto es su respuesta de negocio (ya guardada por el aprendizaje) →
  // lo invitamos al primer registro. Si sí registró algo, salimos del onboarding
  // y dejamos que fluya (con su celebración de primera victoria).
  if (enOnboarding(usuario)) {
    await salirDeOnboarding(usuario);
    if (!esAccionDatos) {
      await sendText(mensaje.phone, invitacionPrimerRegistro(usuario));
      return;
    }
  }

  // Candado de trial: solo bloquea nuevos registros (ingreso/egreso/deuda/cuenta por pagar).
  const requiereAcceso = tieneMovs || interp.tipo === 'deuda' || interp.tipo === 'cuenta_pagar';
  if (requiereAcceso && !accesoVigente(usuario)) {
    await sendText(mensaje.phone, mensajeTrialVencido());
    return;
  }

  let respuesta: string;
  if (interp.tipo === 'crear_cuenta') {
    respuesta = await handleCrearCuenta(usuario, interp.cuenta, interp.saldo_inicial);
  } else if (interp.tipo === 'transferencia') {
    respuesta = await handleTransferencia(usuario, interp.cuenta_origen, interp.cuenta_destino, interp.monto);
  } else if (tieneMovs && usaCuentas) {
    // "Mencionar siempre": una cuenta por mensaje. Si no la indicó, se la pedimos.
    const mencion = items.find((i) => i.cuenta)?.cuenta ?? interp.cuenta ?? null;
    if (!mencion) {
      respuesta = await pedirCuenta(usuario, items);
    } else {
      const cuenta = await buscarCuenta(usuario.phone, mencion);
      if (!cuenta) {
        const nombres = await nombresCuentas(usuario.phone);
        respuesta = `No encontré la cuenta "${mencion}" 🤔 Tus cuentas: ${nombres.join(', ')}.`;
      } else {
        respuesta = await registrarPendientesEnCuenta(usuario, items, cuenta);
      }
    }
  } else if (tieneMovs) {
    respuesta = await registrarMovimientos(usuario, items, mensaje.texto);
  } else if (esAccionDatos) {
    respuesta = await handleRegistro(usuario, interp);
  } else {
    // 'consulta' | 'desconocido' → usamos la respuesta del modelo.
    respuesta = interp.respuesta;
  }

  // Guardamos el turno (usuario + Abakus) en el historial real, para que el
  // próximo mensaje de seguimiento se entienda en contexto.
  registrarTurno(usuario.phone, 'user', mensaje.texto);
  registrarTurno(usuario.phone, 'assistant', respuesta);
  await sendText(mensaje.phone, respuesta);
}

/**
 * Limpia el estado de onboarding en memoria y en la DB (idempotente). Se llama
 * cuando el usuario hace algo distinto a responder la pregunta de onboarding
 * (un comando, un documento o un registro). Nunca rompe el flujo principal.
 */
async function salirDeOnboarding(usuario: Usuario): Promise<void> {
  if (!enOnboarding(usuario)) return;
  usuario.estado_conversacion = null;
  try {
    await updateUsuario(usuario.phone, { estado_conversacion: null });
  } catch (err) {
    console.error('[abakus][onboarding] No se pudo limpiar el estado:', err);
  }
}

/**
 * Guarda lo que Abakus aprendió del usuario en este mensaje: nombre, negocio y
 * tono (campos directos de `usuarios`) y memoria explícita (lista de datos
 * durables). Nunca rompe el flujo principal: los errores se loguean y se ignoran
 * (ej. si aún no existe la columna `memoria` en la DB).
 */
async function persistirAprendizaje(usuario: Usuario, interp: Interpretacion): Promise<void> {
  const campos: Partial<Pick<Usuario, 'nombre' | 'negocio' | 'tono' | 'moneda'>> = {};

  if (interp.nombre && interp.nombre !== usuario.nombre) {
    campos.nombre = interp.nombre;
    usuario.nombre = interp.nombre;
  }
  if (interp.negocio && interp.negocio !== usuario.negocio) {
    campos.negocio = interp.negocio;
    usuario.negocio = interp.negocio;
  }
  if (interp.tono && interp.tono !== usuario.tono) {
    campos.tono = interp.tono;
    usuario.tono = interp.tono;
  }
  try {
    if (Object.keys(campos).length > 0) {
      await updateUsuario(usuario.phone, campos);
    }
    if (interp.aprendizaje) {
      await agregarAprendizaje(usuario.phone, interp.aprendizaje);
    }
  } catch (err) {
    console.error('[abakus][aprendizaje] No se pudo persistir el aprendizaje:', err);
  }

  // Moneda aparte: solo si la persona mencionó una soportada y distinta a la
  // actual. En su propio try/catch para que una columna `moneda` aún no migrada
  // no bloquee el resto del aprendizaje.
  const monedaDetectada = interp.moneda?.toUpperCase();
  if (monedaDetectada && esMonedaSoportada(monedaDetectada) && monedaDetectada !== usuario.moneda) {
    usuario.moneda = monedaDetectada;
    try {
      await updateUsuario(usuario.phone, { moneda: monedaDetectada });
    } catch (err) {
      console.error('[abakus][moneda] No se pudo persistir la moneda:', err);
    }
  }
}
