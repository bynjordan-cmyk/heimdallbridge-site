// Dedup en memoria de message_id de Meta (puede reenviar el mismo webhook 2 veces).
// NOTA: en memoria solo sirve para una instancia. Para producción multi-instancia
// o reinicios frecuentes, mover a Redis o a una tabla en Supabase.

const MAX = 5_000;
const vistos = new Set<string>();
const orden: string[] = [];

/**
 * Devuelve true si el messageId ya fue procesado. Si es nuevo, lo registra.
 */
export function yaProcesado(messageId: string): boolean {
  if (vistos.has(messageId)) {
    return true;
  }
  vistos.add(messageId);
  orden.push(messageId);

  if (orden.length > MAX) {
    const viejo = orden.shift();
    if (viejo) vistos.delete(viejo);
  }
  return false;
}
