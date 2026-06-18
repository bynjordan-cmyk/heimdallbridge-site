import { supabase } from './client';
import { CuentaPorCobrar, Movimiento, TipoMovimiento, Usuario } from '../types';

export async function getUsuarioByPhone(phone: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return (data as Usuario | null) ?? null;
}

export async function createUsuario(phone: string, nombre: string | null): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .insert({ phone, nombre })
    .select()
    .single();

  if (error) throw error;
  return data as Usuario;
}

/** Actualiza campos arbitrarios del usuario por teléfono. */
export async function updateUsuario(
  phone: string,
  campos: Partial<
    Pick<Usuario, 'nombre' | 'email' | 'estado_conversacion' | 'plan' | 'activo' | 'negocio' | 'tono' | 'memoria'>
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
  const counts = new Map<string, number>();
  for (const v of valores) {
    const c = (v ?? '').trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([c]) => c);
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

export async function insertMovimiento(input: {
  userPhone: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  rawMessage: string | null;
}): Promise<Movimiento> {
  const { data, error } = await supabase
    .from('movimientos')
    .insert({
      user_phone: input.userPhone,
      tipo: input.tipo,
      monto: input.monto,
      categoria: input.categoria,
      descripcion: input.descripcion,
      raw_message: input.rawMessage,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Movimiento;
}

/** Inserta movimientos en lote (carga masiva desde Excel). Se envían en lotes de 200. */
export async function insertMovimientosMasivo(
  userPhone: string,
  movimientos: {
    tipo: TipoMovimiento;
    monto: number;
    categoria: string | null;
    descripcion: string | null;
    fecha: string;
  }[],
): Promise<void> {
  const CHUNK = 200;

  for (let i = 0; i < movimientos.length; i += CHUNK) {
    const lote = movimientos.slice(i, i + CHUNK).map((m) => ({
      user_phone: userPhone,
      tipo: m.tipo,
      monto: m.monto,
      categoria: m.categoria,
      descripcion: m.descripcion,
      fecha: m.fecha,
      raw_message: 'Carga masiva (Excel)',
    }));

    const { error } = await supabase.from('movimientos').insert(lote);
    if (error) throw error;
  }
}

export async function insertCuentaPorCobrar(input: {
  userPhone: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fechaVencimiento: string | null;
}): Promise<CuentaPorCobrar> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .insert({
      user_phone: input.userPhone,
      tipo: 'por_cobrar',
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

export async function contarCuentasPendientes(userPhone: string): Promise<number> {
  const { count, error } = await supabase
    .from('cuentas_pendientes')
    .select('id', { count: 'exact', head: true })
    .eq('user_phone', userPhone)
    .eq('pagado', false);

  if (error) throw error;
  return count ?? 0;
}

export async function getCuentasPendientes(userPhone: string): Promise<CuentaPorCobrar[]> {
  const { data, error } = await supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
    .eq('pagado', false)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as CuentaPorCobrar[];
}

/**
 * Marca como pagada la cuenta más reciente que coincida con la contraparte (y monto, si se da).
 * Devuelve la cuenta actualizada, o null si no encontró ninguna.
 */
export async function marcarCobrado(
  userPhone: string,
  contraparte: string | null,
  monto: number | null,
): Promise<CuentaPorCobrar | null> {
  let query = supabase
    .from('cuentas_pendientes')
    .select('*')
    .eq('user_phone', userPhone)
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

/** Obtiene todos los usuarios activos (trial vigente o plan de pago). */
export async function getUsuariosActivos(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .neq('onboarding_step', null); // excluye filas vacías; todos tienen este campo

  if (error) throw error;
  return (data ?? []) as Usuario[];
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

/**
 * Elimina el movimiento más reciente del usuario.
 * Devuelve el movimiento eliminado, o null si no había ninguno.
 */
export async function eliminarUltimoMovimiento(
  userPhone: string,
): Promise<Movimiento | null> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('user_phone', userPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const mov = data as Movimiento;
  const { error: delError } = await supabase.from('movimientos').delete().eq('id', mov.id);
  if (delError) throw delError;
  return mov;
}
