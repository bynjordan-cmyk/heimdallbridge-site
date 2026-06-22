import { Cuenta, MovimientoInterpretado, Usuario } from '../types';
import {
  buscarCuenta,
  crearCuenta,
  getCuentas,
  getSaldosCuentas,
  insertMovimientosMasivo,
  insertTransferencia,
  updateUsuario,
} from '../supabase/queries';
import { formatMonto } from '../utils/format';
import { esSinClasificar } from './registro';
import { armarEsperandoCategoria, PREGUNTA_CATEGORIA } from './clasificacion';

const ESPERANDO_CUENTA = 'esperando_cuenta';

function tipoDesdeNombre(nombre: string): 'banco' | 'caja' {
  const n = nombre.toLowerCase();
  return n.includes('caja') || n.includes('efectivo') || n.includes('billetera') ? 'caja' : 'banco';
}

/** Nombres de las cuentas del usuario (para inyectar en el contexto de Claude). */
export async function nombresCuentas(userPhone: string): Promise<string[]> {
  const cuentas = await getCuentas(userPhone);
  return cuentas.map((c) => c.nombre);
}

/** crear_cuenta: crea la cuenta (o ajusta su saldo inicial si ya existe). */
export async function handleCrearCuenta(user: Usuario, nombre: string | null, saldoInicial: number | null): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  if (!nombre) {
    return '¿Cómo quieres llamar la cuenta? Por ejemplo: "tengo Banco Estado con 100000" o "agrega caja con 5000".';
  }

  const tipo = tipoDesdeNombre(nombre);
  const { cuenta, actualizada } = await crearCuenta(user.phone, nombre, tipo, saldoInicial ?? 0);
  const emoji = tipo === 'caja' ? '💵' : '🏦';

  if (actualizada) {
    return `${emoji} Actualicé el saldo inicial de *${cuenta.nombre}* a ${f(Number(cuenta.saldo_inicial))}.`;
  }
  return `${emoji} Cuenta *${cuenta.nombre}* creada con saldo inicial ${f(Number(cuenta.saldo_inicial))}.\n\nAhora, al registrar un movimiento dime a qué cuenta va (ej. "pagué 5000 de luz con ${cuenta.nombre}").`;
}

/** transferencia: mueve plata entre dos cuentas del usuario. */
export async function handleTransferencia(
  user: Usuario,
  nombreOrigen: string | null,
  nombreDestino: string | null,
  monto: number | null,
): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  if (monto === null || monto <= 0) {
    return '¿Cuánto transferiste? Por ejemplo: "transferí 50000 de Banco Estado a Caja".';
  }
  if (!nombreOrigen || !nombreDestino) {
    return 'Dime desde y hacia qué cuenta. Por ejemplo: "transferí 50000 de Banco Estado a Caja".';
  }

  const [origen, destino] = await Promise.all([
    buscarCuenta(user.phone, nombreOrigen),
    buscarCuenta(user.phone, nombreDestino),
  ]);

  if (!origen) return cuentaNoEncontrada(user, nombreOrigen);
  if (!destino) return cuentaNoEncontrada(user, nombreDestino);
  if (origen.id === destino.id) return 'La cuenta de origen y destino son la misma 🤔';

  await insertTransferencia(user.phone, origen.id, destino.id, monto);

  const saldos = await getSaldosCuentas(user.phone);
  const so = saldos.find((c) => c.id === origen.id);
  const sd = saldos.find((c) => c.id === destino.id);

  return `🔁 Transferencia registrada\n${f(monto)}: *${origen.nombre}* → *${destino.nombre}*` +
    (so && sd ? `\n\n${origen.nombre}: ${f(so.saldo)}\n${destino.nombre}: ${f(sd.saldo)}` : '');
}

/** Comando "cuentas"/"saldos": lista las cuentas con su saldo y el total. */
export async function handleListarCuentas(user: Usuario): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  const saldos = await getSaldosCuentas(user.phone);

  if (saldos.length === 0) {
    return '🏦 Aún no tienes cuentas. Crea una diciéndome, por ejemplo:\n"tengo Banco Estado con 100000" o "agrega caja con 5000".';
  }

  const lineas = saldos
    .map((c) => `${tipoDesdeNombre(c.nombre) === 'caja' ? '💵' : '🏦'} ${c.nombre}: *${f(c.saldo)}*`)
    .join('\n');
  const total = saldos.reduce((s, c) => s + c.saldo, 0);

  return `🏦 *Tus cuentas*\n${lineas}\n\n💼 Total: *${f(total)}*`;
}

/** Mensaje de cuenta no encontrada, con la lista de cuentas disponibles. */
async function cuentaNoEncontrada(user: Usuario, intento: string): Promise<string> {
  const nombres = await nombresCuentas(user.phone);
  const lista = nombres.length > 0 ? `\n\nTus cuentas: ${nombres.join(', ')}.` : '';
  return `No encontré la cuenta "${intento}" 🤔${lista}`;
}

/** ¿El usuario está respondiendo a qué cuenta va un movimiento pendiente? */
export function esperandoCuenta(user: Usuario): boolean {
  return user.estado_conversacion === ESPERANDO_CUENTA;
}

/**
 * Deja movimientos en espera de que el usuario indique la cuenta y devuelve la
 * pregunta correspondiente.
 */
export async function pedirCuenta(user: Usuario, items: MovimientoInterpretado[]): Promise<string> {
  await updateUsuario(user.phone, { estado_conversacion: ESPERANDO_CUENTA, pendiente: items });
  const nombres = await nombresCuentas(user.phone);
  const total = items.reduce((s, m) => s + m.monto, 0);
  const f = (n: number) => formatMonto(n, user.moneda);
  const detalle = items.length === 1
    ? `el ${items[0].tipo} de ${f(items[0].monto)}`
    : `los ${items.length} movimientos (${f(total)})`;
  return `¿A qué cuenta registro ${detalle}?\nTus cuentas: ${nombres.join(', ')}.`;
}

/**
 * Resuelve la cuenta indicada por el usuario para los movimientos pendientes.
 * Devuelve los items con su cuentaId resuelta, o null si no reconoció la cuenta
 * (en cuyo caso `mensajeError` explica por qué).
 */
export async function resolverCuentaPendiente(
  user: Usuario,
  texto: string,
): Promise<{ items: { item: MovimientoInterpretado; cuentaId: string }[]; cuenta: Cuenta } | { error: string }> {
  const cuenta = await buscarCuenta(user.phone, texto);
  if (!cuenta) {
    const nombres = await nombresCuentas(user.phone);
    return { error: `No reconocí esa cuenta 🤔 Dime una de: ${nombres.join(', ')}.` };
  }
  const pendientes = user.pendiente ?? [];
  return { items: pendientes.map((item) => ({ item, cuentaId: cuenta.id })), cuenta };
}

/** Limpia el estado de espera de cuenta. */
export async function limpiarPendiente(user: Usuario): Promise<void> {
  user.estado_conversacion = null;
  user.pendiente = null;
  await updateUsuario(user.phone, { estado_conversacion: null, pendiente: null });
}

/**
 * Inserta los movimientos pendientes ya con su cuenta y devuelve un resumen corto.
 */
export async function registrarPendientesEnCuenta(
  user: Usuario,
  items: MovimientoInterpretado[],
  cuenta: Cuenta,
): Promise<string> {
  const f = (n: number) => formatMonto(n, user.moneda);
  const hoy = new Date().toISOString().slice(0, 10);

  const insertados = await insertMovimientosMasivo(
    user.phone,
    items.map((m) => ({
      tipo: m.tipo,
      monto: m.monto,
      categoria: m.categoria,
      descripcion: m.descripcion,
      fecha: m.fecha ?? hoy,
      cuentaId: cuenta.id,
    })),
    'Registro por WhatsApp',
  );

  const ingresos = items.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresos = items.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const saldos = await getSaldosCuentas(user.phone);
  const saldo = saldos.find((c) => c.id === cuenta.id);

  const unico = items.length === 1 ? items[0] : null;
  const cat = unico?.categoria ? ` · ${unico.categoria}` : unico ? ' · Sin clasificar' : '';
  let msg = unico
    ? `✅ Registrado en *${cuenta.nombre}*\n${unico.tipo === 'ingreso' ? '💰' : '💸'} ${f(unico.monto)}${cat}`
    : `✅ ${items.length} movimientos en *${cuenta.nombre}*`;
  if (items.length > 1) {
    if (ingresos > 0) msg += `\n💰 Ingresos: ${f(ingresos)}`;
    if (egresos > 0) msg += `\n💸 Egresos: ${f(egresos)}`;
  }
  if (saldo) msg += `\n\nSaldo de ${cuenta.nombre}: *${f(saldo.saldo)}*`;

  // Si es un único movimiento y quedó sin clasificar, armamos el estado
  // determinista para que la próxima respuesta lo clasifique (no se pierde).
  if (unico && esSinClasificar(unico.categoria)) {
    await armarEsperandoCategoria(user, insertados[0]?.correlativo ?? null);
    msg += PREGUNTA_CATEGORIA;
  }
  return msg;
}
