import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { Interpretacion, TipoInterpretacion } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres Abakus, un asistente financiero para freelancers y microempresarios latinoamericanos.
Interpretas mensajes de WhatsApp y devuelves un objeto estructurado.

Reglas:
- Si el tipo es "consulta", la respuesta debe ser útil y empática.
- Si el tipo es "desconocido", pide clarificación amigable.
- Usa lenguaje cercano, sin jerga financiera.
- Moneda en CLP por defecto (Chile).
- No inventes datos, solo interpreta lo que el usuario dice.
- "respuesta" es el mensaje amigable que se le enviará al usuario.`;

// JSON Schema escrito a mano. Con output_config.format Claude garantiza que la
// respuesta es JSON válido que cumple este esquema (structured outputs).
// nullable se expresa con anyOf [..., null]; todos los campos van en required.
const SCHEMA = {
  type: 'object',
  properties: {
    tipo: {
      type: 'string',
      enum: ['ingreso', 'egreso', 'consulta', 'deuda', 'desconocido'],
    },
    monto: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    categoria: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    descripcion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    contraparte: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    fecha_vencimiento: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    respuesta: { type: 'string' },
  },
  required: [
    'tipo',
    'monto',
    'categoria',
    'descripcion',
    'contraparte',
    'fecha_vencimiento',
    'respuesta',
  ],
  additionalProperties: false,
} as const;

const TIPOS_VALIDOS: TipoInterpretacion[] = [
  'ingreso',
  'egreso',
  'consulta',
  'deuda',
  'desconocido',
];

const RESPUESTA_FALLBACK = 'No estoy seguro de haber entendido 🤔 ¿Me lo cuentas de otra forma?';

export async function interpretar(texto: string): Promise<Interpretacion> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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
  };
}
