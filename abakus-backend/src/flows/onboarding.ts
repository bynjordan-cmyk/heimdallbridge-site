import { createUsuario } from '../supabase/queries';

const BIENVENIDA = `¡Hola! Soy Abakus 🧮, tu asistente financiero por WhatsApp.

Por favor, indícame si quieres registrar un ingreso, egreso, deuda o si tienes alguna consulta específica.`;

/**
 * Crea el usuario en estado 'onboarding' y devuelve el mensaje de bienvenida.
 */
export async function handleOnboarding(phone: string, nombre: string | null): Promise<string> {
  await createUsuario(phone, nombre);
  return BIENVENIDA;
}
