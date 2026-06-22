import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { MovimientoInterpretado, TipoMovimiento } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

/** Resultado de leer una factura/boleta (imagen o PDF). */
export interface FacturaLeida {
  legible: boolean;
  movimientos: MovimientoInterpretado[];
  proveedor: string | null;
  resumen: string; // texto humano de lo que se leyó
}

const PROMPT = `Eres Abakus 🧮. Te paso una FACTURA o BOLETA (imagen o PDF). Extrae el/los movimientos financieros para registrarlos.

REGLAS:
- Una factura/boleta de COMPRA es un EGRESO (gasto). Una boleta/factura que el usuario EMITE a un cliente es un INGRESO. Si no está claro, asume EGRESO (lo más común).
- "monto": usa el TOTAL a pagar de la factura (con impuestos incluidos). Un solo movimiento por la factura, salvo que claramente sean cosas separadas.
- "fecha": la fecha de emisión de la factura en formato "YYYY-MM-DD". Si no se ve, null.
- "categoria": infiérela del giro/productos (ej. supermercado→"Alimentación", combustible→"Transporte", luz/agua→"Servicios básicos"). Si no puedes, "Sin clasificar".
- "descripcion": breve (ej. "Boleta Líder", "Factura Sodimac").
- "proveedor": el nombre del comercio/emisor.
- HOY es ${'${HOY}'} (para resolver fechas relativas si aplica).
- Si la imagen/PDF NO es una factura legible o no logras leer un monto, devuelve legible=false, movimientos=[] y en "resumen" explica brevemente qué pasó.
- "resumen": una línea humana de lo que leíste (ej. "Boleta de Líder por $23.490 del 21/06").`;

const SCHEMA = {
  type: 'object',
  properties: {
    legible: { type: 'boolean' },
    proveedor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    resumen: { type: 'string' },
    movimientos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['ingreso', 'egreso'] },
          monto: { type: 'number' },
          categoria: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          descripcion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          fecha: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['tipo', 'monto', 'categoria', 'descripcion', 'fecha'],
        additionalProperties: false,
      },
    },
  },
  required: ['legible', 'proveedor', 'resumen', 'movimientos'],
  additionalProperties: false,
} as const;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function bloqueArchivo(buffer: Buffer, mimeType: string): Anthropic.ContentBlockParam {
  const data = buffer.toString('base64');
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  // Imagen: normaliza el media_type a uno soportado.
  const tipo = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
    ? (mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif')
    : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: tipo, data } };
}

/** Lee una factura/boleta (imagen o PDF) y extrae el/los movimientos. */
export async function extraerFactura(buffer: Buffer, mimeType: string): Promise<FacturaLeida> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: PROMPT.replace('${HOY}', hoyISO()),
    messages: [
      {
        role: 'user',
        content: [
          bloqueArchivo(buffer, mimeType),
          { type: 'text', text: 'Lee esta factura/boleta y extrae el movimiento.' },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';
  return normalizar(raw);
}

function textoLimpio(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function normalizar(raw: string): FacturaLeida {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const movimientos: MovimientoInterpretado[] = [];
  if (Array.isArray(parsed.movimientos)) {
    for (const item of parsed.movimientos) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      const tipo = m.tipo === 'ingreso' || m.tipo === 'egreso' ? (m.tipo as TipoMovimiento) : null;
      const monto = typeof m.monto === 'number' && Number.isFinite(m.monto) && m.monto > 0 ? m.monto : null;
      if (!tipo || monto === null) continue;
      movimientos.push({
        tipo,
        monto,
        categoria: textoLimpio(m.categoria),
        descripcion: textoLimpio(m.descripcion),
        fecha: typeof m.fecha === 'string' && FECHA_RE.test(m.fecha) ? m.fecha : null,
        cuenta: null,
      });
    }
  }

  return {
    legible: parsed.legible === true && movimientos.length > 0,
    movimientos,
    proveedor: textoLimpio(parsed.proveedor),
    resumen: textoLimpio(parsed.resumen) ?? 'No pude leer bien la factura 🤔',
  };
}
