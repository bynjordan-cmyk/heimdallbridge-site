import { supabase } from '../supabase/client';

// Reporte de "salud del aprendizaje" para administración. Consulta directa a
// Supabase (aislado de queries.ts para no chocar con otras ramas). Solo lectura.

interface UsuarioAprendizaje {
  phone: string;
  nombre: string | null;
  negocio: string | null;
  tono: string | null;
  moneda: string | null;
  plan: string | null;
  memoria: number; // cantidad de datos recordados
  created_at: string | null;
}

export interface ReporteAprendizaje {
  generadoEn: string;
  usuarios: {
    total: number;
    conNombre: number;
    conNegocio: number;
    conTono: number;
    conMemoria: number;
    conMoneda: number;
  };
  movimientos: {
    total: number;
    clasificados: number;
    sinClasificar: number;
    tasaClasificacion: number; // 0-100
  };
  cuentas: {
    total: number;
    usuariosConCuentas: number;
  };
  recientes: UsuarioAprendizaje[];
}

async function contar(tabla: string, filtro?: (q: any) => any): Promise<number> {
  try {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true });
    if (filtro) q = filtro(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function generarReporteAprendizaje(limiteRecientes = 25): Promise<ReporteAprendizaje> {
  // Usuarios (lista acotada para el detalle + cálculo de cuántos "aprendieron").
  const { data: usuariosData, error } = await supabase
    .from('usuarios')
    .select('phone, nombre, negocio, tono, moneda, plan, memoria, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const usuarios = (usuariosData ?? []) as Array<Record<string, unknown>>;
  const memoriaLen = (m: unknown) => (Array.isArray(m) ? m.length : 0);
  const tiene = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  const resumenUsuarios = {
    total: usuarios.length,
    conNombre: usuarios.filter((u) => tiene(u.nombre)).length,
    conNegocio: usuarios.filter((u) => tiene(u.negocio)).length,
    conTono: usuarios.filter((u) => tiene(u.tono)).length,
    conMemoria: usuarios.filter((u) => memoriaLen(u.memoria) > 0).length,
    conMoneda: usuarios.filter((u) => tiene(u.moneda)).length,
  };

  const [totalMovs, sinClasificar, totalCuentas] = await Promise.all([
    contar('movimientos'),
    contar('movimientos', (q) => q.or('categoria.is.null,categoria.ilike.sin clasificar')),
    contar('cuentas'),
  ]);
  const clasificados = Math.max(0, totalMovs - sinClasificar);
  const tasaClasificacion = totalMovs > 0 ? Math.round((clasificados / totalMovs) * 100) : 0;

  // Usuarios con cuentas (distinct user_phone en cuentas).
  let usuariosConCuentas = 0;
  try {
    const { data } = await supabase.from('cuentas').select('user_phone').limit(5000);
    usuariosConCuentas = new Set((data ?? []).map((r) => (r as { user_phone: string }).user_phone)).size;
  } catch {
    usuariosConCuentas = 0;
  }

  const recientes: UsuarioAprendizaje[] = usuarios.slice(0, limiteRecientes).map((u) => ({
    phone: String(u.phone ?? ''),
    nombre: (u.nombre as string) ?? null,
    negocio: (u.negocio as string) ?? null,
    tono: (u.tono as string) ?? null,
    moneda: (u.moneda as string) ?? null,
    plan: (u.plan as string) ?? null,
    memoria: memoriaLen(u.memoria),
    created_at: (u.created_at as string) ?? null,
  }));

  return {
    generadoEn: new Date().toISOString(),
    usuarios: resumenUsuarios,
    movimientos: { total: totalMovs, clasificados, sinClasificar, tasaClasificacion },
    cuentas: { total: totalCuentas, usuariosConCuentas },
    recientes,
  };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function maskPhone(phone: string): string {
  // Muestra solo los últimos 4 dígitos (privacidad básica): +5691234**** -> ****1234
  const d = phone.replace(/\D/g, '');
  return d.length >= 4 ? `…${d.slice(-4)}` : phone;
}

/** Renderiza el reporte como una página HTML simple para revisar en el navegador. */
export function renderHtmlAprendizaje(r: ReporteAprendizaje): string {
  const card = (label: string, value: string) =>
    `<div style="background:#1B2A4A;color:#fff;border-radius:10px;padding:14px 18px;min-width:140px"><div style="font-size:12px;opacity:.7">${label}</div><div style="font-size:24px;font-weight:700">${value}</div></div>`;

  const filas = r.recientes
    .map(
      (u) => `<tr>
      <td>${esc(maskPhone(u.phone))}</td>
      <td>${esc(u.nombre ?? '—')}</td>
      <td>${esc(u.negocio ?? '—')}</td>
      <td>${esc(u.tono ?? '—')}</td>
      <td style="text-align:center">${u.memoria}</td>
      <td style="text-align:center">${esc(u.moneda ?? '—')}</td>
      <td>${esc((u.created_at ?? '').slice(0, 10))}</td>
    </tr>`,
    )
    .join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abakus — Aprendizaje</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;padding:24px;background:#F0F4F8;color:#1a1a1a}
  h1{font-size:20px} .sub{color:#666;font-size:13px;margin-bottom:20px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;margin-top:18px;font-size:13px}
  th,td{padding:9px 12px;border-bottom:1px solid #eee;text-align:left}
  th{background:#2C3E6B;color:#fff;font-weight:600}
  tr:nth-child(even){background:#F8FAFB}
  .sec{margin-top:24px;font-weight:700;font-size:15px}
</style></head><body>
<h1>🧮 Abakus — Salud del aprendizaje</h1>
<div class="sub">Generado: ${esc(r.generadoEn)}</div>

<div class="sec">Usuarios (${r.usuarios.total})</div>
<div class="cards">
  ${card('Con nombre', String(r.usuarios.conNombre))}
  ${card('Con negocio', String(r.usuarios.conNegocio))}
  ${card('Con tono', String(r.usuarios.conTono))}
  ${card('Con memoria', String(r.usuarios.conMemoria))}
  ${card('Con moneda', String(r.usuarios.conMoneda))}
</div>

<div class="sec">Movimientos</div>
<div class="cards">
  ${card('Total', String(r.movimientos.total))}
  ${card('Clasificados', String(r.movimientos.clasificados))}
  ${card('Sin clasificar', String(r.movimientos.sinClasificar))}
  ${card('% clasificación', r.movimientos.tasaClasificacion + '%')}
</div>

<div class="sec">Cuentas</div>
<div class="cards">
  ${card('Cuentas creadas', String(r.cuentas.total))}
  ${card('Usuarios con cuentas', String(r.cuentas.usuariosConCuentas))}
</div>

<div class="sec">Últimos usuarios y lo aprendido</div>
<table>
  <tr><th>Tel</th><th>Nombre</th><th>Negocio</th><th>Tono</th><th>Memoria</th><th>Moneda</th><th>Alta</th></tr>
  ${filas || '<tr><td colspan="7">Sin usuarios.</td></tr>'}
</table>
</body></html>`;
}
