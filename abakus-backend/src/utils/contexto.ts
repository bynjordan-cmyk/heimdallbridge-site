// Contexto conversacional efímero EN MEMORIA, por teléfono. Permite que Abakus
// entienda respuestas de seguimiento (ej. responder "mi salario" a la pregunta
// "¿de dónde vino ese dinero?") inyectando su último mensaje al usuario.
//
// Es en memoria a propósito: no sobrevive reinicios ni multi-instancia (igual
// que la dedup de idempotencia). Es un "nice to have" de UX, no fuente de verdad.

interface CtxConversacion {
  ultimoBot: string;
  ts: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 min: pasado ese tiempo ya no es "seguimiento"
const MAX_ENTRADAS = 5000;
const cache = new Map<string, CtxConversacion>();

/** Guarda el último mensaje que Abakus envió a este usuario. */
export function recordarRespuesta(phone: string, ultimoBot: string): void {
  if (cache.size >= MAX_ENTRADAS) {
    const masViejo = cache.keys().next().value;
    if (masViejo) cache.delete(masViejo);
  }
  cache.set(phone, { ultimoBot, ts: Date.now() });
}

/** Devuelve el último mensaje de Abakus si es reciente (< TTL), o null. */
export function ultimaRespuesta(phone: string): string | null {
  const c = cache.get(phone);
  if (!c) return null;
  if (Date.now() - c.ts > TTL_MS) {
    cache.delete(phone);
    return null;
  }
  return c.ultimoBot;
}
