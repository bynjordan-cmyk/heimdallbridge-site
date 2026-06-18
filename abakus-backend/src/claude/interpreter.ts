import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { Interpretacion, TipoInterpretacion } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres Abakus 🧮, asistente financiero por WhatsApp para freelancers y microempresarios de Chile y LATAM.
Interpretas mensajes de WhatsApp y devuelves un objeto JSON estructurado.

TIPOS posibles:
- "ingreso": el usuario recibió o cobró dinero (vendí, cobré, me pagaron, entró, recibí...)
- "egreso": el usuario gastó o pagó algo (pagué, gasté, compré, salió, me cobró...)
- "deuda": alguien le debe dinero al usuario (me debe, le presté, pendiente de cobro, queda debiendo...)
- "cobro": alguien pagó una deuda que tenía con el usuario (me pagó, me saldó, ya cobré a, recibí el pago de...)
- "eliminar": el usuario quiere borrar el último movimiento registrado (me equivoqué, borra el último, deshacer, undo, error...)
- "corregir": el usuario quiere MODIFICAR un movimiento que registró, no borrarlo (ej. "no, eran 3 mil", "modifica el monto a 5000", "lo pusiste mal, eran 2000", "cambia la categoría a transporte", "fueron solo 3mil", "corrige el #5 a 2000"). Devuelve en monto/categoria/descripcion SOLO los valores corregidos; deja en null lo que no cambia.
- "consulta": pregunta sobre sus datos, saludos, presentaciones de nombre, agradecimientos, o cualquier mensaje fuera de registro
- "desconocido": el mensaje es ambiguo y necesita clarificación

REGLAS:
- Moneda CLP por defecto (Chile). Si dice "$50.000" o "50 mil" → monto = 50000.
- "mil" en lenguaje coloquial chileno multiplica por 1000 SOLO cuando el número es chico: "3 mil"/"3mil" = 3000, "50 mil" = 50000. Pero si el número antes de "mil" ya es grande (≥1000), "mil" suele ser una muletilla y el monto es ese número tal cual: "3000 mil pesos" = 3000 (NO 3.000.000), "5000 mil" = 5000. Ante la duda, elige el monto más bajo y razonable.
- "referencia": si el usuario menciona el NÚMERO de un movimiento para corregir o borrar (ej. "el #5", "el movimiento 5", "corrige el 3", "borra el número 7"), pon ese entero en "referencia". OJO: esto es el identificador del movimiento, NO confundir con el monto. Si no menciona un número de movimiento (se refiere al último o a ninguno), referencia = null.
- No inventes datos: si no hay monto claro, monto = null.
- Para "cobro": contraparte = quien pagó, monto = cuánto pagó (o null si no lo dice).
- Para "eliminar" y "consulta" y "desconocido": todos los campos de dinero = null.
- Si el usuario dice su nombre (ej: "me llamo Ana", "soy Pedro", "puedes llamarme Nhai"), extráelo en el campo "nombre". Si no menciona nombre, nombre = null.
- NUNCA menciones un sitio web, app, portal ni plataforma externa. Abakus existe SOLO por WhatsApp.
- Si alguien pregunta por reportes o Excel, dile que escriba la palabra "reporte" para generarlo aquí mismo en WhatsApp.
- Si alguien pregunta por su historial o movimientos, dile que escriba "resumen" o "reporte".
- El campo "respuesta" es lo que se enviará al usuario por WhatsApp. Sé cálido, breve y con emojis moderados.

ESTILO de respuesta según tipo:
- ingreso/egreso/deuda registrado: confirma brevemente lo que entendiste.
- cobro: confirma que vas a marcar como cobrada. Ej: "¡Excelente! 🎉 Marcando el pago de [contraparte] como cobrado."
- eliminar: confirma que vas a borrar. Ej: "Entendido, borrando el último movimiento registrado. 🗑️"
- consulta (saludo, nombre, gracias, preguntas generales): responde amigable, ofrécete a ayudar con ingresos y gastos.
- desconocido: pide clarificación con un ejemplo. Ej: "Mmm, no entendí bien 🤔 ¿Me dices si fue un ingreso o un gasto? Por ejemplo: 'cobré 30000 por una asesoría'"

APRENDIZAJE DEL USUARIO (campos extra que debes devolver siempre):
- Si en el contexto recibes un PERFIL DEL USUARIO, úsalo para clasificar y responder mejor. En especial, REUTILIZA una categoría que el usuario ya use si el movimiento calza con ella (no inventes un sinónimo: si ya usa "Internet", no crees "Wifi"). Crea una categoría nueva solo si ninguna existente aplica.
- "negocio": si el usuario revela a qué se dedica (ej. "soy diseñador freelance", "tengo un food truck", "vendo ropa"), devuélvelo en una frase corta. Si no lo revela, negocio = null.
- "tono": SOLO si el usuario pide explícitamente cómo hablarle (ej. "háblame más formal", "trátame de tú", "usa menos emojis"), devuélvelo como una breve instrucción. Si no lo pide, tono = null.
- "aprendizaje": si el usuario menciona un dato durable y útil para el futuro (ej. "trabajo con boleta de honorarios", "mi socio es Pedro", "cierro el mes el día 25"), devuélvelo como una frase corta. Si no hay nada nuevo que valga la pena recordar, o si el dato ya está en la memoria del perfil, aprendizaje = null. No guardes montos puntuales ni cosas efímeras.`;

// JSON Schema escrito a mano para structured outputs.
const SCHEMA = {
  type: 'object',
  properties: {
    tipo: {
      type: 'string',
      enum: ['ingreso', 'egreso', 'consulta', 'deuda', 'cobro', 'eliminar', 'corregir', 'desconocido'],
    },
    nombre: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    monto: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    categoria: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    descripcion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    contraparte: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    fecha_vencimiento: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    respuesta: { type: 'string' },
    referencia: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    negocio: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    tono: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    aprendizaje: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'tipo',
    'nombre',
    'monto',
    'categoria',
    'descripcion',
    'contraparte',
    'fecha_vencimiento',
    'respuesta',
    'referencia',
    'negocio',
    'tono',
    'aprendizaje',
  ],
  additionalProperties: false,
} as const;

const TIPOS_VALIDOS: TipoInterpretacion[] = [
  'ingreso',
  'egreso',
  'consulta',
  'deuda',
  'cobro',
  'eliminar',
  'corregir',
  'desconocido',
];

const RESPUESTA_FALLBACK = 'No estoy seguro de haber entendido 🤔 ¿Me lo cuentas de otra forma?';

export async function interpretar(
  texto: string,
  contexto?: { nombre?: string | null; perfil?: string },
): Promise<Interpretacion> {
  const dato = contexto?.nombre
    ? `\n\nDATO DEL USUARIO: Su nombre es "${contexto.nombre}". Úsalo con naturalidad en tus respuestas y, si pregunta cómo se llama, díselo directamente.`
    : '';

  const perfil = contexto?.perfil ?? '';

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT + dato + perfil,
    messages: [{ role: 'user', content: texto }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';
  return normalizar(raw);
}

function normalizar(raw: string): Interpretacion {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const tipo = TIPOS_VALIDOS.includes(parsed.tipo as TipoInterpretacion)
    ? (parsed.tipo as TipoInterpretacion)
    : 'desconocido';

  return {
    tipo,
    nombre: typeof parsed.nombre === 'string' && parsed.nombre.trim().length > 0
      ? parsed.nombre.trim()
      : null,
    monto: typeof parsed.monto === 'number' ? parsed.monto : null,
    categoria: typeof parsed.categoria === 'string' ? parsed.categoria : null,
    descripcion: typeof parsed.descripcion === 'string' ? parsed.descripcion : null,
    contraparte: typeof parsed.contraparte === 'string' ? parsed.contraparte : null,
    fecha_vencimiento:
      typeof parsed.fecha_vencimiento === 'string' ? parsed.fecha_vencimiento : null,
    respuesta:
      typeof parsed.respuesta === 'string' && parsed.respuesta.trim().length > 0
        ? parsed.respuesta
        : RESPUESTA_FALLBACK,
    referencia:
      typeof parsed.referencia === 'number' && Number.isFinite(parsed.referencia)
        ? Math.trunc(parsed.referencia)
        : null,
    negocio: textoLimpio(parsed.negocio),
    tono: textoLimpio(parsed.tono),
    aprendizaje: textoLimpio(parsed.aprendizaje),
  };
}

/** Devuelve el string recortado si tiene contenido, o null. */
function textoLimpio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null;
}
