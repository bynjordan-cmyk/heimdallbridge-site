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
    .insert({ phone, nombre, estado: 'onboarding' })
    .select()
    .single();

  if (error) throw error;
  return data as Usuario;
}

export async function insertMovimiento(input: {
  userId: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
}): Promise<Movimiento> {
  const { data, error } = await supabase
    .from('movimientos')
    .insert({
      user_id: input.userId,
      tipo: input.tipo,
      monto: input.monto,
      categoria: input.categoria,
      descripcion: input.descripcion,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Movimiento;
}

export async function insertCuentaPorCobrar(input: {
  userId: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fechaVencimiento: string | null;
}): Promise<CuentaPorCobrar> {
  const { data, error } = await supabase
    .from('cuentas_por_cobrar')
    .insert({
      user_id: input.userId,
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

export async function getResumenMes(userId: string): Promise<ResumenMes> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const desde = inicioMes.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from('movimientos')
    .select('tipo, monto')
    .eq('user_id', userId)
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

export async function getCuentasPendientes(userId: string): Promise<CuentaPorCobrar[]> {
  const { data, error } = await supabase
    .from('cuentas_por_cobrar')
    .select('*')
    .eq('user_id', userId)
    .eq('estado', 'pendiente')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as CuentaPorCobrar[];
}
