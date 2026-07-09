import { supabase } from '../supabase/client';

// Panel de control de Abakus (GET /admin). Vista de administración con
// dashboard + gestión de usuarios (plan, prueba, activar/desactivar) y detalle.
// Las acciones que modifican datos viven en acciones.ts y entran por POST.
// Aislado de los flujos de WhatsApp: consulta directa a Supabase.

const PLANES_PAGO = ['basico', 'pro', 'premium'];

interface UsuarioPanel {
  phone: string;
  nombre: string | null;
  negocio: string | null;
  plan: string | null;
  activo: boolean | null;
  moneda: string | null;
  trial_ends_at: string | null;
  ultimo_mensaje_at: string | null;
  created_at: string | null;
  memoria: number;
  movimientos: number;
}

export interface DatosPanel {
  generadoEn: string;
  metricas: {
    usuarios: number;
    activos: number;
    enPrueba: number;
    dePago: number;
    pruebaVencida: number;
    movimientos: number;
    tasaClasificacion: number;
    cuentas: number;
    reportesNuevos: number;
  };
  usuarios: UsuarioPanel[];
  reportes: ReportePanel[];
}

interface ReportePanel {
  id: string;
  phone: string | null;
  nombre: string | null;
  mensaje: string;
  version: string | null;
  estado: string | null;
  created_at: string | null;
}

function esPago(plan: string | null | undefined): boolean {
  return typeof plan === 'string' && PLANES_PAGO.includes(plan.toLowerCase());
}

function pruebaVigente(trial: string | null | undefined): boolean {
  if (!trial) return true; // sin fecha = usuarios legacy/n8n: se asume vigente
  return new Date(trial).getTime() > Date.now();
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

/** Reúne todo lo que muestra el panel: métricas + lista de usuarios. */
export async function reunirDatosPanel(): Promise<DatosPanel> {
  const { data: usuariosData, error } = await supabase
    .from('usuarios')
    .select('phone, nombre, negocio, plan, activo, moneda, trial_ends_at, ultimo_mensaje_at, memoria, created_at')
    .order('created_at', { ascending: false })
    .limit(3000);
  if (error) throw error;
  const usuarios = (usuariosData ?? []) as Array<Record<string, unknown>>;

  // Conteo de movimientos por teléfono (en memoria; volumen bajo).
  const conteoMovs = new Map<string, number>();
  try {
    const { data } = await supabase.from('movimientos').select('user_phone').limit(50000);
    for (const r of (data ?? []) as Array<{ user_phone: string }>) {
      conteoMovs.set(r.user_phone, (conteoMovs.get(r.user_phone) ?? 0) + 1);
    }
  } catch {
    /* degrada: quedan en 0 */
  }

  const lista: UsuarioPanel[] = usuarios.map((u) => {
    const phone = String(u.phone ?? '');
    return {
      phone,
      nombre: (u.nombre as string) ?? null,
      negocio: (u.negocio as string) ?? null,
      plan: (u.plan as string) ?? null,
      activo: (u.activo as boolean) ?? null,
      moneda: (u.moneda as string) ?? null,
      trial_ends_at: (u.trial_ends_at as string) ?? null,
      ultimo_mensaje_at: (u.ultimo_mensaje_at as string) ?? null,
      created_at: (u.created_at as string) ?? null,
      memoria: Array.isArray(u.memoria) ? (u.memoria as unknown[]).length : 0,
      movimientos: conteoMovs.get(phone) ?? 0,
    };
  });

  const dePago = lista.filter((u) => esPago(u.plan)).length;
  const enPrueba = lista.filter((u) => !esPago(u.plan) && pruebaVigente(u.trial_ends_at)).length;
  const pruebaVencida = lista.filter((u) => !esPago(u.plan) && !pruebaVigente(u.trial_ends_at)).length;
  const activos = lista.filter((u) => u.activo === true).length;

  const [totalMovs, sinClasificar, totalCuentas] = await Promise.all([
    contar('movimientos'),
    contar('movimientos', (q) => q.or('categoria.is.null,categoria.ilike.sin clasificar')),
    contar('cuentas'),
  ]);
  const clasificados = Math.max(0, totalMovs - sinClasificar);
  const tasaClasificacion = totalMovs > 0 ? Math.round((clasificados / totalMovs) * 100) : 0;

  // Reportes de bug/soporte (últimos 60). Tolera que la tabla no exista aún.
  let reportes: ReportePanel[] = [];
  try {
    const { data } = await supabase
      .from('reportes')
      .select('id, user_phone, nombre, mensaje, version, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(60);
    reportes = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id ?? ''),
        phone: (row.user_phone as string) ?? null,
        nombre: (row.nombre as string) ?? null,
        mensaje: String(row.mensaje ?? ''),
        version: (row.version as string) ?? null,
        estado: (row.estado as string) ?? 'nuevo',
        created_at: (row.created_at as string) ?? null,
      };
    });
  } catch {
    reportes = [];
  }
  const reportesNuevos = reportes.filter((r) => (r.estado ?? 'nuevo') === 'nuevo').length;

  return {
    generadoEn: new Date().toISOString(),
    reportes,
    metricas: {
      usuarios: lista.length,
      activos,
      enPrueba,
      dePago,
      pruebaVencida,
      movimientos: totalMovs,
      tasaClasificacion,
      cuentas: totalCuentas,
      reportesNuevos,
    },
    usuarios: lista,
  };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function badgePlan(plan: string | null): string {
  const p = (plan ?? 'gratis').toLowerCase();
  const colores: Record<string, string> = {
    gratis: '#7f8c8d',
    basico: '#2980b9',
    pro: '#8e44ad',
    premium: '#c0392b',
  };
  const bg = colores[p] ?? '#7f8c8d';
  return `<span class="badge" style="background:${bg}">${esc(p)}</span>`;
}

function estadoPrueba(u: UsuarioPanel): string {
  if (esPago(u.plan)) return '<span class="muted">—</span>';
  if (!u.trial_ends_at) return '<span class="muted">sin fecha</span>';
  const vence = String(u.trial_ends_at).slice(0, 10);
  const vigente = new Date(u.trial_ends_at).getTime() > Date.now();
  return vigente
    ? `<span style="color:#27ae60">vence ${esc(vence)}</span>`
    : `<span style="color:#c0392b">vencida ${esc(vence)}</span>`;
}

function tarjeta(label: string, value: string, sub = ''): string {
  return `<div class="card"><div class="card-l">${esc(label)}</div><div class="card-v">${esc(value)}</div>${
    sub ? `<div class="card-s">${esc(sub)}</div>` : ''
  }</div>`;
}

/** Renderiza el panel completo como página HTML autocontenida. */
export function renderPanel(d: DatosPanel, key: string): string {
  const m = d.metricas;

  const filas = d.usuarios
    .map((u) => {
      const ultimo = u.ultimo_mensaje_at ? String(u.ultimo_mensaje_at).slice(0, 10) : '—';
      const busca = `${u.nombre ?? ''} ${u.phone} ${u.negocio ?? ''} ${u.plan ?? ''}`.toLowerCase();
      return `<tr data-phone="${esc(u.phone)}" data-busca="${esc(busca)}">
        <td class="tel">${esc(u.phone)}</td>
        <td>${esc(u.nombre ?? '—')}</td>
        <td>${esc(u.negocio ?? '—')}</td>
        <td>${badgePlan(u.plan)}</td>
        <td>${estadoPrueba(u)}</td>
        <td style="text-align:center">${esc(u.moneda ?? '—')}</td>
        <td style="text-align:center">${u.movimientos}</td>
        <td style="text-align:center">${u.activo === false ? '🔴' : '🟢'}</td>
        <td>${esc(ultimo)}</td>
        <td class="acc">
          <select class="sel-plan" title="Cambiar plan">
            <option value="">Plan…</option>
            <option value="gratis">Gratis</option>
            <option value="basico">Básico</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>
          <button class="b b7" title="Extender prueba 7 días">+7d</button>
          <button class="b b30" title="Extender prueba 30 días">+30d</button>
          <button class="b btog" title="Activar / desactivar">${u.activo === false ? 'Activar' : 'Desact.'}</button>
          <button class="b bver" title="Ver detalle">Ver</button>
        </td>
      </tr>`;
    })
    .join('');

  const badgeEstado = (e: string | null): string => {
    const s = (e ?? 'nuevo').toLowerCase();
    const col: Record<string, string> = { nuevo: '#c0392b', visto: '#d68910', resuelto: '#27ae60' };
    return `<span class="badge" style="background:${col[s] ?? '#7f8c8d'}">${esc(s)}</span>`;
  };
  const filasReportes = d.reportes
    .map((r) => {
      const quien = r.nombre ? `${r.nombre} · ${r.phone ?? ''}` : (r.phone ?? '—');
      const fecha = r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '—';
      return `<tr data-id="${esc(r.id)}">
        <td style="white-space:nowrap">${esc(fecha)}</td>
        <td class="tel">${esc(quien)}</td>
        <td style="white-space:normal;min-width:280px">${esc(r.mensaje)}</td>
        <td style="text-align:center">${esc(r.version ?? '—')}</td>
        <td>${badgeEstado(r.estado)}</td>
        <td class="acc">
          <button class="b brep" data-estado="visto" title="Marcar como visto">Visto</button>
          <button class="b brep bres" data-estado="resuelto" title="Marcar como resuelto">Resuelto</button>
        </td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abakus — Panel de Control</title>
<style>
  :root{--navy:#1B2A4A;--navy2:#2C3E6B}
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;background:#EEF2F7;color:#1a1a1a}
  header{background:var(--navy);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  header h1{font-size:18px;margin:0}
  header .v{font-size:12px;opacity:.7}
  main{padding:20px 24px;max-width:1400px;margin:0 auto}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#fff;border-radius:12px;padding:14px 18px;min-width:130px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .card-l{font-size:12px;color:#777}
  .card-v{font-size:26px;font-weight:700;color:var(--navy)}
  .card-s{font-size:11px;color:#999}
  .bar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
  #q{flex:1;min-width:220px;padding:10px 14px;border:1px solid #ccd;border-radius:10px;font-size:14px}
  .count{font-size:13px;color:#666}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  th,td{padding:9px 10px;border-bottom:1px solid #eef;text-align:left;white-space:nowrap}
  th{background:var(--navy2);color:#fff;font-weight:600;position:sticky;top:0}
  tr:nth-child(even){background:#F7FAFC}
  .tel{font-family:ui-monospace,monospace;font-size:12px}
  .badge{color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;text-transform:capitalize}
  .muted{color:#999}
  .acc{display:flex;gap:4px;align-items:center;white-space:nowrap}
  .acc select,.b{font-size:12px;border:1px solid #cbd;border-radius:8px;padding:4px 8px;background:#fff;cursor:pointer}
  .b:hover{background:#eef}
  .bver{background:var(--navy);color:#fff;border-color:var(--navy)}
  .bres{background:#27ae60;color:#fff;border-color:#27ae60}
  .sec-title{margin:34px 0 10px;color:var(--navy);font-size:18px}
  .tabla-wrap{overflow-x:auto}
  #toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:60}
  #toast.show{opacity:1}
  #modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:50;overflow:auto}
  #modal.show{display:flex}
  .box{background:#fff;border-radius:14px;max-width:900px;width:100%;padding:24px;position:relative}
  .box .x{position:absolute;top:14px;right:16px;font-size:22px;cursor:pointer;color:#999;border:none;background:none}
  .det-cards{display:flex;gap:10px;margin:14px 0}
  .dc{background:#F4F7FB;border-radius:10px;padding:10px 14px;flex:1}
  .dc .big{font-size:18px;font-weight:700;color:var(--navy)}
  .det-sec{font-weight:700;margin:16px 0 6px;color:var(--navy)}
  table.mini{font-size:12px} table.mini th{background:#8895b3}
  ul.mem{margin:6px 0;padding-left:18px} ul.mem li{margin:2px 0}
</style></head><body>
<header>
  <h1>🧮 Abakus — Panel de Control</h1>
  <span class="v">Generado ${esc(d.generadoEn.slice(0, 16).replace('T', ' '))} · <a href="/admin/aprendizaje?key=${encodeURIComponent(
    key,
  )}" style="color:#9fd">aprendizaje ↗</a></span>
</header>
<main>
  <div class="cards">
    ${tarjeta('Usuarios', String(m.usuarios))}
    ${tarjeta('Activos', String(m.activos))}
    ${tarjeta('En prueba', String(m.enPrueba), `${m.pruebaVencida} vencidas`)}
    ${tarjeta('De pago', String(m.dePago))}
    ${tarjeta('Movimientos', String(m.movimientos))}
    ${tarjeta('% Clasificación', m.tasaClasificacion + '%')}
    ${tarjeta('Cuentas', String(m.cuentas))}
    ${tarjeta('Reportes nuevos', String(m.reportesNuevos), `${d.reportes.length} en total`)}
  </div>

  <div class="bar">
    <input id="q" placeholder="🔍 Buscar por nombre, teléfono, negocio o plan…" autocomplete="off">
    <span class="count" id="count">${d.usuarios.length} usuarios</span>
  </div>

  <div class="tabla-wrap">
  <table id="tabla">
    <thead><tr>
      <th>Teléfono</th><th>Nombre</th><th>Negocio</th><th>Plan</th><th>Prueba</th>
      <th>Moneda</th><th>Movs</th><th>Estado</th><th>Últ. msg</th><th>Acciones</th>
    </tr></thead>
    <tbody>${filas || '<tr><td colspan="10">Sin usuarios.</td></tr>'}</tbody>
  </table>
  </div>

  <h2 class="sec-title">🐞 Reportes de usuarios</h2>
  <div class="tabla-wrap">
  <table id="tabla-rep">
    <thead><tr>
      <th>Fecha</th><th>Usuario</th><th>Mensaje</th><th>Versión</th><th>Estado</th><th>Acciones</th>
    </tr></thead>
    <tbody>${filasReportes || '<tr><td colspan="6">Sin reportes todavía.</td></tr>'}</tbody>
  </table>
  </div>
</main>

<div id="modal"><div class="box"><button class="x" onclick="cerrar()">×</button><div id="det">Cargando…</div></div></div>
<div id="toast"></div>

<script>
const KEY = ${JSON.stringify(key)};
const q = document.getElementById('q');
const rows = [...document.querySelectorAll('#tabla tbody tr[data-phone]')];
const count = document.getElementById('count');

q.addEventListener('input', () => {
  const t = q.value.trim().toLowerCase();
  let n = 0;
  for (const r of rows) {
    const hit = !t || (r.dataset.busca || '').includes(t);
    r.style.display = hit ? '' : 'none';
    if (hit) n++;
  }
  count.textContent = n + ' usuarios';
});

function toast(msg, ok) {
  const el = document.getElementById('toast');
  el.textContent = (ok ? '✅ ' : '⚠️ ') + msg;
  el.style.background = ok ? '#1a7a43' : '#a5341f';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

async function accion(phone, acc, valor) {
  try {
    const res = await fetch('/admin/api/accion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KEY, phone, accion: acc, valor: String(valor ?? '') }),
    });
    const j = await res.json();
    toast(j.mensaje || (j.ok ? 'Listo' : 'Error'), !!j.ok);
    if (j.ok) setTimeout(() => location.reload(), 900);
  } catch (e) {
    toast('No se pudo conectar', false);
  }
}

async function verDetalle(phone) {
  const modal = document.getElementById('modal');
  const det = document.getElementById('det');
  det.innerHTML = 'Cargando…';
  modal.classList.add('show');
  try {
    const res = await fetch('/admin/api/usuario?key=' + encodeURIComponent(KEY) + '&phone=' + encodeURIComponent(phone));
    det.innerHTML = await res.text();
  } catch (e) {
    det.innerHTML = '<p>No se pudo cargar el detalle.</p>';
  }
}
function cerrar() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrar(); });

document.querySelectorAll('#tabla tbody tr[data-phone]').forEach((r) => {
  const phone = r.dataset.phone;
  r.querySelector('.sel-plan').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    if (confirm('¿Cambiar plan a ' + v.toUpperCase() + '?')) accion(phone, 'plan', v);
    else e.target.value = '';
  });
  r.querySelector('.b7').addEventListener('click', () => accion(phone, 'extender', 7));
  r.querySelector('.b30').addEventListener('click', () => accion(phone, 'extender', 30));
  r.querySelector('.btog').addEventListener('click', (e) => {
    const activar = e.target.textContent.trim() === 'Activar';
    accion(phone, activar ? 'activar' : 'desactivar', '');
  });
  r.querySelector('.bver').addEventListener('click', () => verDetalle(phone));
});

// Reportes: marcar como visto / resuelto. El id del reporte viaja en el campo "phone".
document.querySelectorAll('#tabla-rep tbody tr[data-id]').forEach((r) => {
  const id = r.dataset.id;
  r.querySelectorAll('.brep').forEach((b) => {
    b.addEventListener('click', () => accion(id, 'reporte', b.dataset.estado));
  });
});
</script>
</body></html>`;
}
