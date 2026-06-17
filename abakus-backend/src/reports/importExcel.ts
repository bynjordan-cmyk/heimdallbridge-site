import ExcelJS from 'exceljs';
import { TipoMovimiento } from '../types';

export interface ParsedMovimiento {
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  fecha: string; // YYYY-MM-DD
}

type CampoMovimiento = 'fecha' | 'tipo' | 'monto' | 'categoria' | 'descripcion';

const MAX_FILAS = 500;

const ALIAS_CAMPO: Record<string, CampoMovimiento> = {
  fecha: 'fecha',
  tipo: 'tipo',
  monto: 'monto',
  valor: 'monto',
  categoria: 'categoria',
  rubro: 'categoria',
  descripcion: 'descripcion',
  detalle: 'descripcion',
  glosa: 'descripcion',
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Busca, entre las primeras filas, la que contiene los encabezados (al menos "tipo" y "monto"). */
function encontrarEncabezado(
  ws: ExcelJS.Worksheet,
): { fila: number; columnas: Map<number, CampoMovimiento> } | null {
  const maxScan = Math.min(ws.rowCount, 10);

  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const columnas = new Map<number, CampoMovimiento>();

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const campo = ALIAS_CAMPO[normalizar(String(cell.value ?? ''))];
      if (campo) columnas.set(colNumber, campo);
    });

    const valores = [...columnas.values()];
    if (valores.includes('tipo') && valores.includes('monto')) {
      return { fila: r, columnas };
    }
  }

  return null;
}

function filaVacia(row: ExcelJS.Row): boolean {
  let vacia = true;
  row.eachCell({ includeEmpty: true }, (cell) => {
    if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
      vacia = false;
    }
  });
  return vacia;
}

function parsearTipo(valor: ExcelJS.CellValue): TipoMovimiento | null {
  const t = normalizar(String(valor ?? '')).replace(/[^a-z]/g, '');
  if (t === 'i' || t.includes('ingreso')) return 'ingreso';
  if (t === 'e' || t.includes('egreso') || t.includes('gasto')) return 'egreso';
  return null;
}

function parsearMonto(valor: ExcelJS.CellValue): number | null {
  if (typeof valor === 'number') return valor;

  if (valor && typeof valor === 'object' && 'result' in valor && typeof valor.result === 'number') {
    return valor.result;
  }

  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  // CLP no usa decimales: nos quedamos solo con dígitos y el signo.
  const limpio = texto.replace(/[^\d-]/g, '');
  if (!limpio) return null;

  const num = Number(limpio);
  return Number.isFinite(num) ? num : null;
}

function fechaISODesdeUTC(fecha: Date): string {
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fecha.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parsearFecha(valor: ExcelJS.CellValue): string | null {
  if (valor instanceof Date) return fechaISODesdeUTC(valor);

  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

function limpiarTexto(valor: ExcelJS.CellValue): string | null {
  const texto = String(valor ?? '').trim();
  return texto.length > 0 ? texto : null;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ResultadoParseo {
  validos: ParsedMovimiento[];
  errores: string[];
}

/**
 * Parsea un Excel (.xlsx) con movimientos. Detecta automáticamente las
 * columnas Fecha/Tipo/Monto/Categoría/Descripción (sin importar el orden) y
 * acepta variantes razonables. Filas inválidas se reportan pero no detienen
 * el resto del archivo.
 */
export async function parsearMovimientosExcel(buffer: Buffer): Promise<ResultadoParseo> {
  const wb = new ExcelJS.Workbook();
  // Cast necesario: los tipos de exceljs declaran su propio `Buffer extends
  // ArrayBuffer` global, que choca con el Buffer genérico de @types/node 20+.
  await wb.xlsx.load(buffer as never);

  const ws = wb.worksheets[0];
  if (!ws) {
    return { validos: [], errores: ['El archivo no tiene hojas con datos.'] };
  }

  const encabezado = encontrarEncabezado(ws);
  if (!encabezado) {
    return {
      validos: [],
      errores: ['No encontré las columnas "Tipo" y "Monto". Escribe *plantilla* para descargar el formato correcto.'],
    };
  }

  const validos: ParsedMovimiento[] = [];
  const errores: string[] = [];

  const primeraFila = encabezado.fila + 1;
  const ultimaFilaConDatos = ws.rowCount;
  const ultimaFila = Math.min(ultimaFilaConDatos, encabezado.fila + MAX_FILAS);

  for (let r = primeraFila; r <= ultimaFila; r++) {
    const row = ws.getRow(r);
    if (filaVacia(row)) continue;

    const valores: Partial<Record<CampoMovimiento, ExcelJS.CellValue>> = {};
    for (const [col, campo] of encabezado.columnas) {
      valores[campo] = row.getCell(col).value;
    }

    const tipo = parsearTipo(valores.tipo ?? null);
    if (!tipo) {
      errores.push(`Fila ${r}: el tipo "${String(valores.tipo ?? '')}" no es "ingreso" ni "egreso".`);
      continue;
    }

    const monto = parsearMonto(valores.monto ?? null);
    if (monto === null || monto <= 0) {
      errores.push(`Fila ${r}: el monto no es válido.`);
      continue;
    }

    validos.push({
      tipo,
      monto,
      categoria: limpiarTexto(valores.categoria ?? null),
      descripcion: limpiarTexto(valores.descripcion ?? null),
      fecha: parsearFecha(valores.fecha ?? null) ?? hoyISO(),
    });
  }

  if (ultimaFilaConDatos > ultimaFila) {
    errores.push(`Tu archivo tiene más filas de las que puedo procesar de una vez (máximo ${MAX_FILAS}). Solo cargué las primeras.`);
  }

  return { validos, errores };
}
