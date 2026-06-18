import { Usuario } from '../types';
import { getCategoriasFrecuentes, getContrapartesFrecuentes } from '../supabase/queries';

/**
 * Construye el bloque de "perfil" que se inyecta en el system prompt de Claude
 * para que interprete y responda como si conociera al usuario. Reúne lo que
 * Abakus ha aprendido: negocio, tono, categorías y contrapartes frecuentes, y
 * la memoria explícita.
 *
 * Las consultas a la DB son tolerantes a fallos (ej. si aún no existe la
 * columna `memoria`): un error no debe impedir interpretar el mensaje.
 */
export async function construirPerfil(user: Usuario): Promise<string> {
  const [categorias, contrapartes] = await Promise.all([
    getCategoriasFrecuentes(user.phone).catch(() => [] as string[]),
    getContrapartesFrecuentes(user.phone).catch(() => [] as string[]),
  ]);

  const lineas: string[] = [];

  if (user.negocio) lineas.push(`- Negocio/rubro: ${user.negocio}`);
  if (user.tono) lineas.push(`- Tono preferido: ${user.tono}`);
  if (categorias.length) {
    lineas.push(`- Categorías que ya usa (reutilízalas si el movimiento calza): ${categorias.join(', ')}`);
  }
  if (contrapartes.length) {
    lineas.push(`- Contrapartes frecuentes: ${contrapartes.join(', ')}`);
  }
  const memoria = Array.isArray(user.memoria) ? user.memoria : [];
  if (memoria.length) lineas.push(`- Memoria del usuario: ${memoria.join('; ')}`);

  if (lineas.length === 0) return '';

  return `\n\nPERFIL DEL USUARIO (úsalo para personalizar y clasificar; no lo recites literalmente):\n${lineas.join('\n')}`;
}
