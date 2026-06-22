import { Usuario } from '../types';
import { updateUsuario } from '../supabase/queries';

// Estado conversacional determinista para clasificar un movimiento recién
// registrado como "Sin clasificar". Mismo patrón que `esperando_cuenta`: el
// estado vive en la DB (`usuarios.estado_conversacion`) como
// `esperando_categoria:<correlativo>`, así la respuesta del usuario ("Alimentos")
// se aplica de forma DETERMINISTA al movimiento correcto, sin depender de que la
// IA infiera una corrección. No requiere columna nueva.

const PREFIJO = 'esperando_categoria';
const RE = /^esperando_categoria:(\d+)$/;

/** ¿El usuario está respondiendo a "¿en qué categoría?"? */
export function esperandoCategoria(user: Usuario): boolean {
  return RE.test(user.estado_conversacion ?? '');
}

/** Correlativo del movimiento a clasificar, o null. */
export function correlativoEsperado(user: Usuario): number | null {
  const m = (user.estado_conversacion ?? '').match(RE);
  return m ? Number(m[1]) : null;
}

/** Arma el estado: el próximo mensaje se tomará como la categoría del movimiento #N. */
export async function armarEsperandoCategoria(user: Usuario, correlativo: number | null): Promise<void> {
  if (correlativo == null) return;
  const estado = `${PREFIJO}:${correlativo}`;
  user.estado_conversacion = estado;
  try {
    await updateUsuario(user.phone, { estado_conversacion: estado });
  } catch (err) {
    console.error('[abakus][clasificacion] No se pudo armar esperando_categoria:', err);
  }
}

/** Limpia el estado de espera de categoría. */
export async function limpiarEsperandoCategoria(user: Usuario): Promise<void> {
  user.estado_conversacion = null;
  try {
    await updateUsuario(user.phone, { estado_conversacion: null });
  } catch (err) {
    console.error('[abakus][clasificacion] No se pudo limpiar esperando_categoria:', err);
  }
}

/** Pregunta estándar de categoría (se anexa a la confirmación de un registro sin categoría). */
export const PREGUNTA_CATEGORIA =
  '\n\n🏷️ ¿En qué categoría lo pongo? (ej. _Alimentación_, _Transporte_) — o dime *déjalo* para dejarlo sin clasificar.';

/**
 * ¿El texto parece una respuesta de categoría (y no un comando ni un movimiento
 * nuevo)? Heurística determinista: corto, sin dígitos. Un mensaje con número
 * casi siempre es un movimiento nuevo, no una categoría.
 */
export function pareceCategoria(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t.length <= 40 && !/\d/.test(t);
}

/** ¿El usuario quiere dejarlo sin clasificar? */
export function esNegativaCategoria(texto: string): boolean {
  return /^(no|nada|d[eé]jal|sin categor|no s[eé]|ninguna|luego|despu[eé]s|skip|saltar|omitir)/i.test(
    texto.trim().toLowerCase(),
  );
}
