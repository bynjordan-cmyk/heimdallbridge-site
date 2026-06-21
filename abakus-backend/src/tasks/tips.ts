import { getUsuariosVentana24h } from '../supabase/queries';
import { sendText } from '../whatsapp/sender';
import { Usuario } from '../types';

/**
 * Datos curiosos y tips financieros ("Sabías que..."). Pensados para LATAM y
 * freelancers/microempresarios. Se envía uno por día, rotando por día del año,
 * así todos reciben el mismo tip cada día y la lista cicla sin repetir hasta
 * agotarse.
 */
const TIPS: string[] = [
  'La "regla del 50/30/20" sugiere repartir tus ingresos en 50% necesidades, 30% gustos y 20% ahorro o pago de deudas. Un punto de partida simple para ordenarte.',
  'Pagarte a ti primero funciona: apenas te entra plata, aparta tu ahorro ANTES de gastar. Si esperas a fin de mes, casi nunca sobra.',
  'Un fondo de emergencia ideal cubre de 3 a 6 meses de tus gastos. Para un freelancer con ingresos variables, apuntar a 6 da mucha tranquilidad.',
  'El "interés compuesto" hace que tus ahorros generen ganancias, y esas ganancias generen más ganancias. Einstein lo llamó la octava maravilla del mundo.',
  'Anotar cada gasto, por chico que sea, es el hábito #1 de quienes logran ahorrar. No puedes mejorar lo que no mides. (Para eso estoy yo 😉)',
  'Los "gastos hormiga" (cafecito, delivery, suscripciones que no usas) parecen mínimos, pero sumados al mes pueden ser tu cuota de ahorro completa.',
  'Separar las finanzas del negocio de las personales evita sustos. Si todo sale de la misma cuenta, es casi imposible saber si realmente ganas.',
  'Antes de una compra grande, prueba la regla de las 24 horas: espera un día. Muchas veces, las ganas se pasan y el dinero se queda contigo.',
  'Tener varias fuentes de ingreso reduce tu riesgo: si una falla, no te quedas en cero. La mayoría de la gente financieramente estable no depende de una sola.',
  'La inflación hace que el dinero "guardado bajo el colchón" pierda valor cada año. Por eso conviene que tus ahorros al menos le ganen a la inflación.',
  'Cobrar a tiempo es tan importante como vender. Una venta que no cobras no es una ganancia, es un préstamo gratis que le hiciste a tu cliente.',
  'Definir tu "sueldo" como dueño —un monto fijo que te pagas— te da estabilidad y evita que te comas las ganancias del negocio sin darte cuenta.',
  'Las deudas "buenas" (las que generan ingresos o suben de valor) se diferencian de las "malas" (consumo que se devalúa). No toda deuda es igual.',
  'Revisar tus números una vez por semana, aunque sean 5 minutos, te da más control que mirarlos una vez al año cuando ya es tarde.',
  'Guardar un porcentaje fijo de cada ingreso (no un monto fijo) hace que ahorres más en los meses buenos, sin sufrir en los flojos.',
  'El presupuesto no es para gastar menos, es para gastar con intención: decidir tú a dónde va tu plata, en vez de preguntarte a fin de mes dónde quedó.',
  'Negociar plazos con proveedores (pagar más tarde) y con clientes (cobrar más temprano) mejora tu flujo de caja sin vender un peso más.',
  'Apartar desde ya lo que deberás en impuestos evita el susto anual. Un porcentaje de cada ingreso a una cuenta aparte y listo.',
  'El costo de oportunidad: cada peso que gastas en algo es un peso que no puedes usar en otra cosa. Pensar así afina mucho las decisiones.',
  'Automatizar tu ahorro (transferencia programada apenas cobras) le gana a la fuerza de voluntad. Lo que no ves, no lo gastas.',
  'Un cliente que paga tarde te cuesta dinero real: es plata que no puedes reinvertir. Por eso vale la pena llevar tus cuentas por cobrar al día.',
  'Redondear tus precios y conocer tu margen real evita el error clásico de vender mucho y ganar poco. Vender no siempre es ganar.',
  'Tener claro tu "punto de equilibrio" (cuánto necesitas vender para cubrir costos) te dice exactamente desde qué monto empiezas a ganar de verdad.',
  'Revisar tus suscripciones cada cierto tiempo y cancelar las que no usas es una de las formas más rápidas de recuperar plata sin esfuerzo.',
];

/** Día del año (1–366) para rotar el tip de forma determinista. */
function diaDelAnio(d = new Date()): number {
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 0);
  const hoy = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((hoy - inicio) / 86_400_000);
}

/** El tip de hoy (mismo para todos, rota cada día). */
export function tipDelDia(d = new Date()): string {
  return TIPS[diaDelAnio(d) % TIPS.length];
}

function mensajeTip(user: Usuario, tip: string): string {
  const saludo = user.nombre ? `${user.nombre.split(' ')[0]}, ¿` : '¿';
  return `💡 ${saludo}*sabías que...*\n\n${tip}\n\n_Abakus 🧮 · tu dato del día_`;
}

/**
 * Envía el "Sabías que..." del día a los usuarios que escribieron en las últimas
 * 24h (ventana libre de WhatsApp). Así no se intenta escribir fuera de la ventana
 * —donde Meta exigiría plantilla aprobada— y el envío llega de verdad.
 * Devuelve cuántos se enviaron.
 */
export async function enviarTipDiario(): Promise<number> {
  const usuarios = await getUsuariosVentana24h();
  const tip = tipDelDia();

  let enviados = 0;
  for (const user of usuarios) {
    try {
      await sendText(user.phone, mensajeTip(user, tip));
      enviados++;
    } catch (err) {
      console.error(`[abakus][tip] Error para ${user.phone}:`, err);
    }
  }

  console.log(`[abakus][tip] Enviados: ${enviados}/${usuarios.length} usuarios (ventana 24h)`);
  return enviados;
}
