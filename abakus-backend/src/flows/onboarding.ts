import { createUsuario } from '../supabase/queries';
import { Usuario } from '../types';

/**
 * Estado de conversación durante el onboarding guiado: el usuario acaba de
 * recibir la bienvenida y le preguntamos a qué se dedica. Su respuesta la
 * captura el aprendizaje (campo `negocio`), y luego lo invitamos al primer
 * registro. Es un paso liviano: si en vez de responder registra algo o usa un
 * comando, no lo bloqueamos (el handler limpia el estado y sigue de largo).
 */
export const ONB_NEGOCIO = 'onboarding_negocio';

/** ¿El usuario está en el paso "cuéntame a qué te dedicas" del onboarding? */
export function enOnboarding(user: Usuario): boolean {
  return user.estado_conversacion === ONB_NEGOCIO;
}

const BIENVENIDA = (nombre: string | null): string => {
  const saludo = nombre ? `¡Hola, ${nombre.split(' ')[0]}! 👋` : '¡Hola! 👋';
  return `${saludo} Soy *Abakus* 🧮, tu asistente financiero por WhatsApp.

Llevo el control de tus ingresos, gastos y cuentas por cobrar — solo escríbeme en lenguaje natural, sin apps ni planillas. 🙌

Para personalizar tu experiencia, cuéntame: *¿a qué te dedicas?*
_(o escribe *saltar* para empezar de una vez)_`;
};

/**
 * Mensaje del segundo paso: invita a registrar el primer movimiento y deja claro
 * que se pueden cargar varios de una sola vez (carga inicial sin Excel).
 */
export function invitacionPrimerRegistro(user: Usuario): string {
  const intro = user.negocio
    ? `¡Genial! 🙌 Tomo nota.`
    : `¡Perfecto! 🙌`;

  return `${intro} Probemos ahora: escríbeme tu *primer movimiento* en lenguaje natural. Por ejemplo:

💰 _"vendí 80000 en diseño web"_
💸 _"pagué 15000 de internet"_
📋 _"Carlos me debe 50000 hasta el viernes"_

💡 ¿Quieres traer lo de estos días de una vez? Mándamelos todos juntos en un mensaje:
_"vendí 50 mil el lunes, pagué 20 mil de arriendo y gasté 8 mil en bencina"_

Cuando quieras tu balance, escribe *resumen*. Y *ayuda* para ver todo lo que puedo hacer.`;
}

/** Paso 1: usuario nuevo. Crea el registro (en onboarding) y devuelve la bienvenida. */
export async function iniciarOnboarding(phone: string, nombre: string | null): Promise<string> {
  await createUsuario(phone, nombre, ONB_NEGOCIO);
  return BIENVENIDA(nombre);
}
