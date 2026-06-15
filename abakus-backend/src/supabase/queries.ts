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
  campos: Partial<Pick<Usuario, 'email' | 'estado_conversacion' | 'plan' | 'activo'>>,
): Promise<void> {
  const { error } = await supabase.from('usuarios').update(campos).eq('phone', phone);
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
