import { supabase } from '../supabase/client';
import { getResumenMes, getSaldosCuentas } from '../supabase/queries';
import { formatMonto } from '../utils/format';
import { CuentaConSaldo, Movimiento, Usuario } from '../types';

// Acciones de administración que MODIFICAN datos (cambiar plan, extender prueba,
// activar/desactivar) + el detalle de un usuario. Aislado de los flujos de
// WhatsApp: consulta y escribe directo en Supabase, igual que reporteAprendizaje.
// Toda mutación entra por POST validando ADMIN_KEY (ver index.ts).

const PLANES_VALIDOS = ['gratis', 'basico', 'pro', 'premium'] as const;
type PlanValido = (typeof PLANES_VALIDOS)[number];

export interface ResultadoAccion {
  ok: boolean;
  mensaje: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function esPlanValido(v: string): v is PlanValido {
  return (PLANES_VALIDOS as readonly string[]).includes(v);
}

/**
 * Cambia el plan del usuario. 'gratis' lo deja sin plan de pago (queda a merced
 * de su prueba); los demás activan acceso pagado. Espeja setPlan() pero acepta
 * 'premium' y se mantiene en el módulo admin.
 */
export async function cambiarPlan(phone: string, plan: string): Promise<ResultadoAccion> {
  if (!esPlanValido(plan)) return { ok: false, mensaje: `Plan inválido: ${plan}` };
  const esPago = plan !== 'gratis';
  const { error } = await supabase
    .from('usuarios')
    .update({ plan, activo: esPago })
    .eq('phone', phone);
  if (error) return { ok: false, mensaje: error.message };
  return { ok: true, mensaje: esPago ? `Plan actualizado a ${plan.toUpperCase()}` : 'Usuario pasado a Gratis' };
}

/**
 * Extiende la prueba gratis `dias` días. La base es la fecha de vencimiento
 * actual si sigue vigente, o desde hoy si ya venció (nunca acorta). Reactiva al
 * usuario para que pueda seguir usando Abakus.
 */
export async function extenderPrueba(phone: string, dias: number): Promise<ResultadoAccion> {
  if (!Number.isFinite(dias) || dias <= 0 || dias > 3650) {
    return { ok: false, mensaje: 'Cantidad de días inválida' };
  }
  const { data, error } = await supabase
    .from('usuarios')
    .select('trial_ends_at')
    .eq('phone', phone)
    .maybeSingle();
  if (error) return { ok: false, mensaje: error.message };

  const ahora = Date.now();
  const actual = data?.trial_ends_at ? new Date(data.trial_ends_at as string).getTime() : 0;
  const base = Number.isFinite(actual) && actual > ahora ? actual : ahora;
  const nueva = new Date(base + dias * DIA_MS).toISOString();

  const { error: upError } = await supabase
    .from('usuarios')
    .update({ trial_ends_at: nueva, activo: true })
    .eq('phone', phone);
  if (upError) return { ok: false, mensaje: upError.message };
  return { ok: true, mensaje: `Prueba extendida hasta ${nueva.slice(0, 10)}` };
}

/** Fija la fecha de vencimiento de la prueba a una fecha exacta (YYYY-MM-DD). */
export async function fijarPrueba(phone: string, fecha: string): Promise<ResultadoAccion> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, mensaje: 'Fecha inválida (usa YYYY-MM-DD)' };
  const iso = new Date(`${fecha}T23:59:59.000Z`).toISOString();
  const { error } = await supabase
    .from('usuarios')
    .update({ trial_ends_at: iso, activo: true })
    .eq('phone', phone);
  if (error) return { ok: false, mensaje: error.message };
  return { ok: true, mensaje: `Prueba fijada hasta ${fecha}` };
}

/** Activa o desactiva la cuenta del usuario. */
export async function setActivo(phone: string, activo: boolean): Promise<ResultadoAccion> {
  const { error } = await supabase.from('usuarios').update({ activo }).eq('phone', phone);
  if (error) return { ok: false, mensaje: error.message };
  return { ok: true, mensaje: activo ? 'Usuario activado' : 'Usuario desactivado' };
}

/** Despacha una acción del panel por su nombre. */
export async function ejecutarAccion(
  accion: string,
  phone: string,
  valor: string,
): Promise<ResultadoAccion> {
  if (!phone) return { ok: false, mensaje: 'Falta el teléfono' };
  switch (accion) {
    case 'plan':
      return cambiarPlan(phone, valor);
    case 'extender':
      return extenderPrueba(phone, Number(valor));
    case 'fijar_prueba':
      return fijarPrueba(phone, valor);
    case 'activar':
      return setActivo(phone, true);
    case 'desactivar':
      return setActivo(phone, false);
    default:
      return { ok: false, mensaje: `Acción desconocida: ${accion}` };
  }
}

// ===== Detalle de usuario (solo lectura) =====

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/**
 * Devuelve un fragmento HTML con el detalle del usuario: datos, resumen del mes,
 * cuentas con saldo, últimos movimientos y memoria aprendida. Se inyecta en el
 * modal del panel. Todo escapado.
 */
export async function detalleUsuarioHtml(phone: string): Promise<string> {
  const { data, error } = await supabase.from('usuarios').select('*').eq('phone', phone).maybeSingle();
  if (error) return `<p style="color:#c0392b">Error: ${esc(error.message)}</p>`;
  if (!data) return `<p>No encontré ningún usuario con ese teléfono.</p>`;
  const u = data as Usuario;
  const moneda = u.moneda ?? 'CLP';
  const f = (n: number) => formatMonto(n, moneda);

  // Datos en paralelo (todo tolerante a fallos para no romper el modal).
  const traerMovs = async (): Promise<Movimiento[]> => {
    try {
      const { data } = await supabase
        .from('movimientos')
        .select('*')
        .eq('user_phone', phone)
        .order('created_at', { ascending: false })
        .limit(15);
      return (data ?? []) as Movimiento[];
    } catch {
      return [];
    }
  };
  const [resumen, saldos, movs] = await Promise.all([
    getResumenMes(phone).catch(() => ({ ingresos: 0, egresos: 0, balance: 0 })),
    getSaldosCuentas(phone).catch(() => [] as CuentaConSaldo[]),
    traerMovs(),
  ]);

  const memoria = Array.isArray(u.memoria) ? u.memoria : [];

  const filaMov = (m: Movimiento) =>
    `<tr>
      <td>${m.correlativo ? '#' + m.correlativo : '—'}</td>
      <td>${m.tipo === 'ingreso' ? '💰' : '💸'} ${esc(m.tipo)}</td>
      <td style="text-align:right">${esc(f(Number(m.monto)))}</td>
      <td>${esc(m.categoria ?? 'Sin clasificar')}</td>
      <td>${esc(m.descripcion ?? '—')}</td>
      <td>${esc(String(m.fecha ?? '').slice(0, 10))}</td>
    </tr>`;

  const tablaMovs = movs.length
    ? `<table class="mini"><tr><th>#</th><th>Tipo</th><th>Monto</th><th>Categoría</th><th>Descripción</th><th>Fecha</th></tr>${movs.map(filaMov).join('')}</table>`
    : '<p class="muted">Sin movimientos.</p>';

  const tablaCuentas = saldos.length
    ? `<table class="mini"><tr><th>Cuenta</th><th>Tipo</th><th style="text-align:right">Saldo</th></tr>${saldos
        .map(
          (c) =>
            `<tr><td>${esc(c.nombre)}</td><td>${esc(c.tipo)}</td><td style="text-align:right">${esc(f(c.saldo))}</td></tr>`,
        )
        .join('')}</table>`
    : '<p class="muted">Sin cuentas creadas.</p>';

  const listaMemoria = memoria.length
    ? `<ul class="mem">${memoria.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    : '<p class="muted">Sin memoria aún.</p>';

  const negocio = u.negocio ? esc(u.negocio) : '—';
  const tono = u.tono ? esc(u.tono) : '—';
  const trial = u.trial_ends_at ? esc(String(u.trial_ends_at).slice(0, 10)) : '—';

  return `
    <div class="det-head">
      <div class="det-datos">
        <div><b>${esc(u.nombre ?? 'Sin nombre')}</b> · ${esc(u.phone)}</div>
        <div class="muted">Negocio: ${negocio} · Tono: ${tono} · Moneda: ${esc(moneda)}</div>
        <div class="muted">Plan: <b>${esc(u.plan ?? 'gratis')}</b> · Prueba hasta: ${trial} · ${u.activo ? '🟢 activo' : '🔴 inactivo'}</div>
      </div>
    </div>
    <div class="det-cards">
      <div class="dc"><div class="muted">Ingresos (mes)</div><div class="big">${esc(f(resumen.ingresos))}</div></div>
      <div class="dc"><div class="muted">Egresos (mes)</div><div class="big">${esc(f(resumen.egresos))}</div></div>
      <div class="dc"><div class="muted">Balance (mes)</div><div class="big">${esc(f(resumen.balance))}</div></div>
    </div>
    <div class="det-sec">Cuentas y saldos</div>
    ${tablaCuentas}
    <div class="det-sec">Últimos movimientos</div>
    ${tablaMovs}
    <div class="det-sec">Memoria aprendida</div>
    ${listaMemoria}
  `;
}
