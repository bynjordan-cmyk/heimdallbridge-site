import OpenAI from 'openai';
import { config } from '../config';
import { Interpretacion, TipoInterpretacion } from '../types';

const client = new OpenAI({ apiKey: config.openai.apiKey });

const SYSTEM_PROMPT = `Eres Abakus, un asistente financiero para freelancers y microempresarios latinoamericanos.
Interpretas mensajes de WhatsApp y devuelves un JSON estructurado.

RESPONDE SOLO CON JSON VÁLIDO, sin markdown, sin explicaciones.

Formato de respuesta:
{
  "tipo": "ingreso" | "egreso" | "consulta" | "deuda" | "desconocido",
  "monto": number | null,
  "categoria": string | null,
  "descripcion": string | null,
  "contraparte": string | null,
  "fecha_vencimiento": "YYYY-MM-DD" | null,
  "respuesta": string
}

Reglas:
- Si el tipo es "consulta", la respuesta debe ser útil y empática.
- Si el tipo es "desconocido", pide clarificación amigable.
- Usa lenguaje cercano, sin jerga financiera.
- Moneda en CLP por defecto (Chile).
- No inventes datos, solo interpreta lo que el usuario dice.`;

const TIPOS_VALIDOS: TipoInterpretacion[] = [
  'ingreso',
  'egreso',
  'consulta',
  'deuda',
  'desconocido',
];

const RESPUESTA_FALLBACK = 'No estoy seguro de haber entendido 🤔 ¿Me lo cuentas de otra forma?';

export async function interpretar(texto: string): Promise<Interpretacion> {
  const completion = await client.chat.completions.create({
    model: config.openai.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: texto },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
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
