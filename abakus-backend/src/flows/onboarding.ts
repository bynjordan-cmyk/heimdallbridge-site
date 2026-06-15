import { createUsuario } from '../supabase/queries';
import { config } from '../config';

const BIENVENIDA = (nombre: string | null) => {
  const saludo = nombre ? `¡Hola, ${nombre.split(' ')[0]}! 👋` : '¡Hola! 👋';
  const pago = config.pago.mercadopagoLink
    ? `\n\n💳 Para activar tu plan cuando quieras, escribe *suscribirme*.`
    : '';
  return `${saludo} Soy *Abakus* 🧮, tu asistente financiero personal por WhatsApp.

Te ayudo a llevar el control de tus ingresos, gastos y cuentas por cobrar sin apps ni Excel — solo escríbeme en lenguaje natural.

Puedes decirme cosas como:
💰 _"vendí 80000 en diseño web"_
💸 _"pagué 15000 de internet"_
📋 _"Carlos me debe 50000 hasta el viernes"_
📊 _"resumen"_ → tu balance del mes${pago}

¿Qué quieres registrar hoy?`;
};

export async function handleOnboarding(phone: string, nombre: string | null): Promise<string> {
  await createUsuario(phone, nombre);
  return BIENVENIDA(nombre);
}
