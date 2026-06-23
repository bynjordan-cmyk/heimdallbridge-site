import { supabase } from './client';
import { Cuenta, CuentaConSaldo, CuentaPorCobrar, Movimiento, TipoMovimiento, Usuario } from '../types';

export async function getUsuarioByPhone(phone: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return (data as Usuario | null) ?? null;
}

export async function createUsuario(
  phone: string,
  nombre: string | null,
  estadoConversacion: string | null = null,
  moneda: string | null = null,
): Promise<Usuario> {
  const fila: Record<string, unknown> = { phone, nombre };
  if (estadoConversacion !== null) fila.estado_conversacion = estadoConversacion;
  if (moneda !== null) fila.moneda = moneda;

  const { data, error } = await supabase.from('usuarios').insert(fila).select().single();

  if (error) {
    // Degrada con gracia si la columna `moneda` aún no existe en la DB:
    // reintenta sin ella para no romper el alta del usuario (onboarding).
    if (moneda !== null) {
      delete fila.moneda;
      const retry = await supabase.from('usuarios').insert(fila).select().single();
      if (retry.error) throw retry.error;
      return retry.data as Usuario;
    }
    throw error;
  }
  return data as Usuario;
}

/** Actualiza campos arbitrarios del usuario por teléfono. */
export async function updateUsuario(
  phone: string,
  campos: Partial<
    Pick<Usuario, 'nombre' | 'email' | 'estado_conversacion' | 'plan' | 'activo' | 'negocio' | 'tono' | 'memoria' | 'moneda' | 'pendiente'>
  >,
): Promise<void> {
  const { error } = await supabase.from('usuarios').update(campos).eq('phone', phone);
  if (error) throw error;
}

/**
 * Categorías que el usuario ya ha usado, ordenadas por frecuencia (más usada
 * primero). Mira sus movimientos recientes para alimentar el aprendizaje de
 * categorías de Claude.
 */
export async function getCategoriasFrecuentes(userPhone: string, limite = 12): Promise<string[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('categoria')
    .eq('user_phone', userPhone)
    .not('categoria', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw error;
  return topPorFrecuencia((data ?? []).map((r) => (r as { categoria: string | null }).categoria), limite);
}

/** Contrapartes con las que el usuario ha tenido cuentas por cobrar, por frecuencia. */
export async function getContrapartesFrecuentes(userPhone: string, limite = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .select('contraparte')
    .eq('user_phone', userPhone)
    .not('contraparte', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return topPorFrecuencia((data ?? []).map((r) => (r as { contraparte: string | null }).contraparte), limite);
}

function topPorFrecuencia(valores: (string | null)[], limite: number): string[] {
  // Agrupa case-insensitive (clave en minúsculas) para que "Transporte" y
  // "transporte" no cuenten como dos categorías distintas, y usa como etiqueta
  // la variante de escritura más frecuente del grupo (canónica del usuario).
  const grupos = new Map<string, { total: number; variantes: Map<string, number> }>();
  for (const v of valores) {
    const c = (v ?? '').trim();
    if (!c) continue;
    const key = c.toLowerCase();
    const g = grupos.get(key) ?? { total: 0, variantes: new Map<string, number>() };
    g.total += 1;
    g.variantes.set(c, (g.variantes.get(c) ?? 0) + 1);
    grupos.set(key, g);
  }
  return [...grupos.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
    .map((g) => [...g.variantes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

/**
 * Agrega un dato durable a la memoria del usuario (dedup case-insensitive,
 * tope de MAX_MEMORIA entradas, FIFO). Requiere la columna `memoria jsonb`.
 */
const MAX_MEMORIA = 20;

export async function agregarAprendizaje(userPhone: string, fact: string): Promise<void> {
  const limpio = fact.trim();
  if (!limpio) return;

  const { data, error } = await supabase
    .from('usuarios')
    .select('memoria')
    .eq('phone', userPhone)
    .maybeSingle();

  if (error) throw error;

  const actual = Array.isArray((data as { memoria?: unknown } | null)?.memoria)
    ? ((data as { memoria: string[] }).memoria)
    : [];

  if (actual.some((m) => m.toLowerCase() === limpio.toLowerCase())) return;

  const nueva = [...actual, limpio].slice(-MAX_MEMORIA);

  const { error: upError } = await supabase
    .from('usuarios')
    .update({ memoria: nueva })
    .eq('phone', userPhone);
  if (upError) throw upError;
}

/** Guarda o actualiza la meta mensual de ingresos del usuario. */
export async function setMeta(phone: string, monto: number): Promise<void> {
  const { error } = await supabase
    .from('usuarios')
    .update({ meta_mensual: monto })
    .eq('phone', phone);
  if (error) throw error;
}

/** Actualiza el plan del usuario. */
export async function setPlan(phone: string, plan: 'basico' | 'pro' | 'gratis'): Promise<void> {
  const { error } = await supabase
    .from('usuarios')
    .update({ plan, activo: plan !== 'gratis' })
    .eq('phone', phone);
  if (error) throw error;
}

/**
 * Próximo correlativo (#N) por usuario. Devuelve null si la columna
 * `correlativo` aún no existe, para degradar sin romper los inserts.
 */
export async function siguienteCorrelativo(userPhone: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('movimientos')
      .select('correlativo')
      .eq('user_phone', userPhone)
      .order('correlativo', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const max = (data as { correlativo: number | null } | null)?.correlativo;
    return (max ?? 0) + 1;
  } catch {
    return null;
  }
}

export async function insertMovimiento(input: {
  userPhone: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  rawMessage: string | null;
  fecha?: string | null;
  cuentaId?: string | null;
}): Promise<Movimiento> {
  const correlativo = await siguienteCorrelativo(input.userPhone);

  const fila: Record<string, unknown> = {
    user_phone: input.userPhone,
    tipo: input.tipo,
    monto: input.monto,
    categoria: input.categoria,
    descripcion: input.descripcion,
    raw_message: input.rawMessage,
  };
  if (correlativo !== null) fila.correlativo = correlativo;
  if (input.fecha) fila.fecha = input.fecha;
  if (input.cuentaId) fila.cuenta_id = input.cuentaId;

  const { data, error } = await supabase
    .from('movimientos')
    .insert(fila)
    .select()
    .single();

  if (error) throw error;
  return data as Movimiento;
}

/**
 * Inserta movimientos en lote (carga masiva por Excel o por mensaje con varios
 * movimientos). Se envían en lotes de 200 y se devuelven las filas insertadas.
 */
export async function insertMovimientosMasivo(
  userPhone: string,
  movimientos: {
    tipo: TipoMovimiento;
    monto: number;
    categoria: string | null;
    descripcion: string | null;
    fecha: string;
    cuentaId?: string | null;
  }[],
  rawMessage = 'Carga masiva (Excel)',
): Promise<Movimiento[]> {
  const CHUNK = 200;
  const base = await siguienteCorrelativo(userPhone); // null si la columna no existe
  const insertados: Movimiento[] = [];

  for (let i = 0; i < movimientos.length; i += CHUNK) {
    const lote = movimientos.slice(i, i + CHUNK).map((m, idx) => {
      const fila: Record<string, unknown> = {
        user_phone: userPhone,
        tipo: m.tipo,
        monto: m.monto,
        categoria: m.categoria,
        descripcion: m.descripcion,
        fecha: m.fecha,
        raw_message: rawMessage,
      };
      if (base !== null) fila.correlativo = base + i + idx;
      if (m.cuentaId) fila.cuenta_id = m.cuentaId;
      return fila;
    });

    const { data, error } = await supabase.from('movimientos').insert(lote).select();
    if (error) throw error;
    if (data) insertados.push(...(data as Movimiento[]));
  }

  return insertados;
}

export type TipoCuenta = 'por_cobrar' | 'por_pagar';

async function insertCuenta(
  tipo: TipoCuenta,
  input: {
    userPhone: string;
    contraparte: string | null;
    monto: number;
    descripcion: string | null;
    fechaVencimiento: string | null;
  },
): Promise<CuentaPorCobrar> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .insert({
      user_phone: input.userPhone,
      tipo,
      contraparte: input.contraparte,
      monto: input.monto,
      descripcion: input.descripcion,
      fecha_vencimiento: input.fechaVencimiento,
    })
    .select()
    .single();

  if (error) throw error;
  return data as CuentaPorCobrar;
}

/** Registra una cuenta por cobrar (alguien le debe al usuario). */
export function insertCuentaPorCobrar(input: {
  userPhone: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fechaVencimiento: string | null;
}): Promise<CuentaPorCobrar> {
  return insertCuenta('por_cobrar', input);
}

/** Registra una cuenta por pagar (el usuario le debe a alguien). */
export function insertCuentaPorPagar(input: {
  userPhone: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fechaVencimiento: string | null;
}): Promise<CuentaPorCobrar> {
  return insertCuenta('por_pagar', input);
}

// ===== Cuentas (bancos / caja) y transferencias =====

/** Error de migración pendiente: las tablas/columnas de cuentas aún no existen. */
export class CuentasNoDisponibleError extends Error {
  constructor() {
    super('Las tablas de cuentas aún no existen (migración pendiente).');
    this.name = 'CuentasNoDisponibleError';
  }
}

/** ¿El error de Supabase es por una tabla o columna que aún no existe? */
function esEsquemaFaltante(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true; // undefined_table / undefined_column
  const m = (error.message ?? '').toLowerCase();
  return m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find');
}

function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export async function getCuentas(userPhone: string): Promise<Cuenta[]> {
  const { data, error } = await supabase
    .from('cuentas')
    .select('*')
    .eq('user_phone', userPhone)
    .order('created_at', { ascending: true });

  if (error) {
    if (esEsquemaFaltante(error)) return []; // migración pendiente → sin cuentas
    throw error;
  }
  return (data ?? []) as Cuenta[];
}

/** ¿El usuario tiene al menos una cuenta? Tolerante si la tabla aún no existe. */
export async function tieneCuentas(userPhone: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('cuentas')
      .select('id', { count: 'exact', head: true })
      .eq('user_phone', userPhone);
    if (error) throw error;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Busca una cuenta del usuario por nombre (tolerante: ignora acentos/mayúsculas
 *  y acepta coincidencia parcial). Devuelve null si no hay match único claro. */
export async function buscarCuenta(userPhone: string, nombre: string): Promise<Cuenta | null> {
  const objetivo = normalizarNombre(nombre);
  if (!objetivo) return null;

  const cuentas = await getCuentas(userPhone);
  // 1) match exacto normalizado
  const exacto = cuentas.find((c) => normalizarNombre(c.nombre) === objetivo);
  if (exacto) return exacto;
  // 2) coincidencia parcial (en cualquier dirección)
  const parciales = cuentas.filter((c) => {
    const n = normalizarNombre(c.nombre);
    return n.includes(objetivo) || objetivo.includes(n);
  });
  return parciales.length === 1 ? parciales[0] : null;
}

/** Crea una cuenta; si ya existe una con el mismo nombre, actualiza su saldo inicial. */
export async function crearCuenta(
  userPhone: string,
  nombre: string,
  tipo: string,
  saldoInicial: number,
): Promise<{ cuenta: Cuenta; actualizada: boolean }> {
  const existente = await buscarCuenta(userPhone, nombre);
  if (existente) {
    const { data, error } = await supabase
      .from('cuentas')
      .update({ saldo_inicial: saldoInicial })
      .eq('id', existente.id)
      .select()
      .single();
    if (error) {
      if (esEsquemaFaltante(error)) throw new CuentasNoDisponibleError();
      throw error;
    }
    return { cuenta: data as Cuenta, actualizada: true };
  }

  const { data, error } = await supabase
    .from('cuentas')
    .insert({ user_phone: userPhone, nombre, tipo, saldo_inicial: saldoInicial })
    .select()
    .single();
  if (error) {
    if (esEsquemaFaltante(error)) throw new CuentasNoDisponibleError();
    throw error;
  }
  return { cuenta: data as Cuenta, actualizada: false };
}

/** Calcula el saldo de cada cuenta: inicial + ingresos − egresos + transf. entrantes − salientes. */
export async function getSaldosCuentas(userPhone: string): Promise<CuentaConSaldo[]> {
  const cuentas = await getCuentas(userPhone);
  if (cuentas.length === 0) return [];

  const [movRes, traRes] = await Promise.all([
    supabase
      .from('movimientos')
      .select('cuenta_id, tipo, monto')
      .eq('user_phone', userPhone)
      .not('cuenta_id', 'is', null),
    supabase
      .from('transferencias')
      .select('cuenta_origen, cuenta_destino, monto')
      .eq('user_phone', userPhone),
  ]);
  if (movRes.error && !esEsquemaFaltante(movRes.error)) throw movRes.error;
  if (traRes.error && !esEsquemaFaltante(traRes.error)) throw traRes.error;

  const saldos = new Map<string, number>();
  for (const c of cuentas) saldos.set(c.id, Number(c.saldo_inicial) || 0);

  for (const m of (movRes.data ?? []) as { cuenta_id: string; tipo: string; monto: number }[]) {
    const actual = saldos.get(m.cuenta_id);
    if (actual === undefined) continue;
    saldos.set(m.cuenta_id, actual + (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)));
  }

  for (const t of (traRes.data ?? []) as { cuenta_origen: string; cuenta_destino: string; monto: number }[]) {
    if (t.cuenta_origen && saldos.has(t.cuenta_origen)) {
      saldos.set(t.cuenta_origen, saldos.get(t.cuenta_origen)! - Number(t.monto));
    }
    if (t.cuenta_destino && saldos.has(t.cuenta_destino)) {
      saldos.set(t.cuenta_destino, saldos.get(t.cuenta_destino)! + Number(t.monto));
    }
  }

  return cuentas.map((c) => ({ ...c, saldo: saldos.get(c.id) ?? (Number(c.saldo_inicial) || 0) }));
}

export async function insertTransferencia(
  userPhone: string,
  cuentaOrigen: string,
  cuentaDestino: string,
  monto: number,
  fecha?: string | null,
): Promise<void> {
  const fila: Record<string, unknown> = {
    user_phone: userPhone,
    cuenta_origen: cuentaOrigen,
    cuenta_destino: cuentaDestino,
    monto,
  };
  if (fecha) fila.fecha = fecha;

  const { error } = await supabase.from('transferencias').insert(fila);
  if (error) {
    if (esEsquemaFaltante(error)) throw new CuentasNoDisponibleError();
    throw error;
  }
}

export interface ResumenMes {
  ingresos: number;
  egresos: number;
  balance: number;
}

export async function getResumenMes(userPhone: string): Promise<ResumenMes> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const desde = inicioMes.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from('movimientos')
    .select('tipo, monto')
    .eq('user_phone', userPhone)
    .gte('fecha', desde);

  if (error) throw error;

  let ingresos = 0;
  let egresos = 0;
  for (const row of (data ?? []) as Pick<Movimiento, 'tipo' | 'monto'>[]) {
    if (row.tipo === 'ingreso') ingresos += Number(row.monto);
    else if (row.tipo === 'egreso') egresos += Number(row.monto);
  }

  return { ingresos, egresos, balance: ingresos - egresos };
}

export async function getMovimientosPeriodo(
  userPhone: string,
  desde: string,
  hasta: string,
): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('user_phone', userPhone)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Movimiento[];
}

export async function contarCuentasPendientes(
  userPhone: string,
  tipo: TipoCuenta = 'por_cobrar',
): Promise<number> {
  const { count, error } = await supabase
    .from('cuentas_pendientes')
    .select('id', { count: 'exact', head: true })
    .eq('user_phone', userPhone)
    .eq('tipo', tipo)
    .eq('pagado', false);

  if (error) throw error;
  return count ?? 0;
}

export async function getCuentasPendientes(
  userPhone: string,
  tipo: TipoCuenta = 'por_cobrar',
): Promise<CuentaPorCobrar[]> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
    .eq('tipo', tipo)
    .eq('pagado', false)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as CuentaPorCobrar[];
}

/** Atajo: cuentas por pagar pendientes (lo que el usuario debe). */
export function getCuentasPorPagar(userPhone: string): Promise<CuentaPorCobrar[]> {
  return getCuentasPendientes(userPhone, 'por_pagar');
}

/**
 * Marca como pagada la cuenta más reciente del tipo indicado que coincida con la
 * contraparte (y monto, si se da). Devuelve la cuenta actualizada, o null.
 */
async function marcarPagada(
  tipo: TipoCuenta,
  userPhone: string,
  contraparte: string | null,
  monto: number | null,
): Promise<CuentaPorCobrar | null> {
  let query = supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
    .eq('tipo', tipo)
    .eq('pagado', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (contraparte) {
    query = query.ilike('contraparte', `%${contraparte}%`);
  }
  if (monto !== null) {
    query = query.eq('monto', monto);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const cuenta = data as CuentaPorCobrar;
  const { error: updateError } = await supabase
    .from('cuentas_pendientes')
    .update({ pagado: true })
    .eq('id', cuenta.id);

  if (updateError) throw updateError;
  return cuenta;
}

/** Marca una cuenta por cobrar como cobrada (alguien le pagó al usuario). */
export function marcarCobrado(
  userPhone: string,
  contraparte: string | null,
  monto: number | null,
): Promise<CuentaPorCobrar | null> {
  return marcarPagada('por_cobrar', userPhone, contraparte, monto);
}

/** Marca una cuenta por pagar como saldada (el usuario pagó lo que debía). */
export function marcarSaldado(
  userPhone: string,
  contraparte: string | null,
  monto: number | null,
): Promise<CuentaPorCobrar | null> {
  return marcarPagada('por_pagar', userPhone, contraparte, monto);
}

export interface CuentaPendienteCorregida {
  anterior: CuentaPorCobrar;
  actualizada: CuentaPorCobrar;
}

/**
 * Actualiza la última cuenta pendiente (CxC/CxP no pagada) con los cambios
 * indicados. Sirve para seguimientos: "no, págalo el 5", "te dije que era ENEL".
 * Devuelve antes/después, o null si no hay cuenta pendiente.
 */
export async function actualizarUltimaCuentaPendiente(
  userPhone: string,
  cambios: { contraparte?: string | null; monto?: number | null; fechaVencimiento?: string | null },
): Promise<CuentaPendienteCorregida | null> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
    .eq('pagado', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const anterior = data as CuentaPorCobrar;

  const upd: Record<string, unknown> = {};
  if (cambios.contraparte != null) upd.contraparte = cambios.contraparte;
  if (cambios.monto != null) upd.monto = cambios.monto;
  if (cambios.fechaVencimiento != null) upd.fecha_vencimiento = cambios.fechaVencimiento;
  if (Object.keys(upd).length === 0) return { anterior, actualizada: anterior };

  const { data: d2, error: e2 } = await supabase
    .from('cuentas_pendientes')
    .update(upd)
    .eq('id', anterior.id)
    .select()
    .single();
  if (e2) throw e2;
  return { anterior, actualizada: d2 as CuentaPorCobrar };
}

/**
 * Usuarios que escribieron en las últimas 24h (ventana libre de WhatsApp).
 * Incluye recién creados (sin `ultimo_mensaje_at` aún) vía `created_at`.
 * Si la columna `ultimo_mensaje_at` no existe todavía, cae a `created_at`.
 */
export async function getUsuariosVentana24h(): Promise<Usuario[]> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .or(`ultimo_mensaje_at.gte.${desde},and(ultimo_mensaje_at.is.null,created_at.gte.${desde})`);
    if (error) throw error;
    return (data ?? []) as Usuario[];
  } catch (err) {
    if (!esEsquemaFaltante(err as { code?: string; message?: string })) throw err;
    // Columna ultimo_mensaje_at aún no migrada → aproxima por created_at.
    const { data, error } = await supabase.from('usuarios').select('*').gte('created_at', desde);
    if (error) throw error;
    return (data ?? []) as Usuario[];
  }
}

/** Marca la hora del último mensaje entrante del usuario (ventana de 24h).
 *  Tolerante: si la columna aún no existe, no rompe el flujo del mensaje. */
export async function touchUltimoMensaje(phone: string): Promise<void> {
  const { error } = await supabase
    .from('usuarios')
    .update({ ultimo_mensaje_at: new Date().toISOString() })
    .eq('phone', phone);
  if (error && !esEsquemaFaltante(error)) {
    console.error('[abakus] No se pudo actualizar ultimo_mensaje_at:', error);
  }
}

/**
 * ¿Ya corrió hoy la tarea diaria `nombre`? Usa la tabla `tareas_diarias`
 * (clave `nombre`, valor `fecha`). Tolerante: si la tabla no existe, devuelve
 * false (no bloquea; el cron sigue siendo el disparo principal).
 */
export async function tareaCorrioHoy(nombre: string, hoy: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('tareas_diarias')
      .select('fecha')
      .eq('nombre', nombre)
      .maybeSingle();
    if (error) {
      if (esEsquemaFaltante(error)) return false;
      throw error;
    }
    return (data as { fecha: string } | null)?.fecha === hoy;
  } catch (err) {
    if (esEsquemaFaltante(err as { code?: string; message?: string })) return false;
    throw err;
  }
}

/** Marca la tarea diaria `nombre` como corrida en `hoy` (upsert). Tolerante. */
export async function marcarTareaCorrida(nombre: string, hoy: string): Promise<void> {
  const { error } = await supabase.from('tareas_diarias').upsert({ nombre, fecha: hoy });
  if (error && !esEsquemaFaltante(error)) {
    console.error('[abakus] No se pudo marcar tarea diaria:', error);
  }
}

/** Cuentas pendientes con vencimiento dentro de N días, sin recordatorio enviado. */
export async function getCuentasPorVencer(
  userPhone: string,
  dias: number,
): Promise<CuentaPorCobrar[]> {
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
    .eq('pagado', false)
    .eq('recordatorio_enviado', false)
    .gte('fecha_vencimiento', hoy)
    .lte('fecha_vencimiento', limite)
    .order('fecha_vencimiento', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CuentaPorCobrar[];
}

export async function marcarRecordatorioEnviado(id: string): Promise<void> {
  const { error } = await supabase
    .from('cuentas_pendientes')
    .update({ recordatorio_enviado: true })
    .eq('id', id);
  if (error) throw error;
}

/** Devuelve el movimiento más reciente del usuario, o null si no hay. */
export async function getUltimoMovimiento(userPhone: string): Promise<Movimiento | null> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('user_phone', userPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as Movimiento | null) ?? null;
}

/**
 * Resuelve el movimiento objetivo: por correlativo (#N) si se indica, o el
 * último si `correlativo` es null. Si la columna `correlativo` no existe,
 * cae al último movimiento.
 */
export async function getMovimientoObjetivo(
  userPhone: string,
  correlativo: number | null,
): Promise<Movimiento | null> {
  if (correlativo === null) return getUltimoMovimiento(userPhone);

  try {
    const { data, error } = await supabase
      .from('movimientos')
      .select('*')
      .eq('user_phone', userPhone)
      .eq('correlativo', correlativo)
      .maybeSingle();

    if (error) throw error;
    return (data as Movimiento | null) ?? null;
  } catch {
    return getUltimoMovimiento(userPhone);
  }
}

export interface MovimientoCorregido {
  anterior: Movimiento;
  actualizado: Movimiento;
}

/**
 * Actualiza un movimiento (por correlativo, o el último si es null) con los
 * cambios indicados (solo campos no-undefined). Devuelve el antes/después, o
 * null si no se encontró el movimiento.
 */
export async function actualizarMovimiento(
  userPhone: string,
  correlativo: number | null,
  cambios: Partial<Pick<Movimiento, 'tipo' | 'monto' | 'categoria' | 'descripcion' | 'cuenta_id'>>,
): Promise<MovimientoCorregido | null> {
  const anterior = await getMovimientoObjetivo(userPhone, correlativo);
  if (!anterior) return null;

  const limpio = Object.fromEntries(
    Object.entries(cambios).filter(([, v]) => v !== undefined && v !== null),
  );

  if (Object.keys(limpio).length === 0) {
    return { anterior, actualizado: anterior };
  }

  const { data, error } = await supabase
    .from('movimientos')
    .update(limpio)
    .eq('id', anterior.id)
    .select()
    .single();

  if (error) throw error;
  return { anterior, actualizado: data as Movimiento };
}

/**
 * Elimina un movimiento (por correlativo, o el último si es null).
 * Devuelve el movimiento eliminado, o null si no se encontró.
 */
export async function eliminarMovimiento(
  userPhone: string,
  correlativo: number | null,
): Promise<Movimiento | null> {
  const mov = await getMovimientoObjetivo(userPhone, correlativo);
  if (!mov) return null;

  const { error: delError } = await supabase.from('movimientos').delete().eq('id', mov.id);
  if (delError) throw delError;
  return mov;
}
