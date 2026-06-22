// Memoria conversacional corta EN MEMORIA, por teléfono. Guarda los últimos
// turnos (usuario y Abakus) para dárselos a Claude como HISTORIAL REAL, de modo
// que entienda mensajes de seguimiento ("no, págalo el 5", "te dije que era ENEL")
// sin perder el hilo.
//
// Es en memoria a propósito (igual que la dedup de idempotencia): no sobrevive
// reinicios ni multi-instancia. Para una conversación normal (turnos con
// segundos/minutos de diferencia) es suficiente y evita inyectar "pistas" sueltas
// que se filtraban entre conversaciones.

export interface Turno {
  role: 'user' | 'assistant';
  text: string;
}

interface Hist {
  turnos: Turno[];
  ts: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 min sin actividad → se descarta el hilo
const MAX_TURNOS = 8; // ~4 intercambios; suficiente para seguimiento sin inflar tokens
const MAX_LEN_TURNO = 600; // recorta respuestas largas (reportes, etc.)
const MAX_ENTRADAS = 5000;
const cache = new Map<string, Hist>();

/** Agrega un turno (usuario o Abakus) al historial del usuario. */
export function registrarTurno(phone: string, role: Turno['role'], text: string): void {
  const limpio = (text ?? '').trim();
  if (!limpio) return;

  let h = cache.get(phone);
  const ahora = Date.now();
  if (!h || ahora - h.ts > TTL_MS) {
    h = { turnos: [], ts: ahora };
  }
  h.turnos.push({ role, text: limpio.slice(0, MAX_LEN_TURNO) });
  if (h.turnos.length > MAX_TURNOS) h.turnos = h.turnos.slice(-MAX_TURNOS);
  h.ts = ahora;

  if (cache.size >= MAX_ENTRADAS && !cache.has(phone)) {
    const masViejo = cache.keys().next().value;
    if (masViejo) cache.delete(masViejo);
  }
  cache.set(phone, h);
}

/** Devuelve los turnos recientes (vacío si no hay o expiró el TTL). */
export function historial(phone: string): Turno[] {
  const h = cache.get(phone);
  if (!h) return [];
  if (Date.now() - h.ts > TTL_MS) {
    cache.delete(phone);
    return [];
  }
  return h.turnos;
}

/** Limpia el historial del usuario (ej. al cambiar de tema con un comando fuerte). */
export function limpiarHistorial(phone: string): void {
  cache.delete(phone);
}
