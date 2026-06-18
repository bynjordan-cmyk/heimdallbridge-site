import ExcelJS from 'exceljs';
import { CuentaPorCobrar, Movimiento } from '../types';
import { Periodo } from './periodo';

// Colores de marca Abakus
const COLOR_HEADER = '1B2A4A';   // Azul marino oscuro
const COLOR_INCOME = '1A7A3F';   // Verde ingreso
const COLOR_EXPENSE = 'C0392B';  // Rojo egreso
const COLOR_BALANCE_POS = '1A7A3F';
const COLOR_BALANCE_NEG = 'C0392B';
const COLOR_ACCENT = 'F0F4F8';   // Gris claro filas alternas
const COLOR_TOTAL_BG = 'DDE3EA'; // Gris total

function clpStr(monto: number): string {
  return `$${Math.round(monto).toLocaleString('es-CL')}`;
}

function fechaStr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function cellFont(bold = false, color = '000000', size = 11): Partial<ExcelJS.Font> {
  return { bold, color: { argb: `FF${color}` }, size, name: 'Calibri' };
}

function fillSolid(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } };
}

function border(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  return { top: side, bottom: side, left: side, right: side };
}

export async function generarReporteExcel(
  movimientos: Movimiento[],
  cuentas: CuentaPorCobrar[],
  periodo: Periodo,
  nombreUsuario: string | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Abakus';
  wb.created = new Date();

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso');
  const egresos = movimientos.filter((m) => m.tipo === 'egreso');
  const totalIngresos = ingresos.reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = egresos.reduce((s, m) => s + Number(m.monto), 0);
  const balance = totalIngresos - totalEgresos;

  agregarHojaResumen(wb, periodo, nombreUsuario, totalIngresos, totalEgresos, balance, movimientos);
  agregarHojaMovimientos(wb, movimientos, periodo);
  if (cuentas.length > 0) {
    agregarHojaCuentas(wb, cuentas);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function agregarHojaResumen(
  wb: ExcelJS.Workbook,
  periodo: Periodo,
  nombre: string | null,
  totalIngresos: number,
  totalEgresos: number,
  balance: number,
  movimientos: Movimiento[],
): void {
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  // --- Bloque de encabezado ---
  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '🧮 ABAKUS — Reporte Financiero';
  titleCell.font = { ...cellFont(true, 'FFFFFF', 16) };
  titleCell.fill = fillSolid(COLOR_HEADER);
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:D2');
  const periodoCell = ws.getCell('A2');
  periodoCell.value = periodo.label;
  periodoCell.font = cellFont(false, 'FFFFFF', 12);
  periodoCell.fill = fillSolid(COLOR_HEADER);
  periodoCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 22;

  ws.mergeCells('A3:D3');
  const userCell = ws.getCell('A3');
  userCell.value = nombre ? `Usuario: ${nombre}` : 'Reporte generado por Abakus 🧮';
  userCell.font = cellFont(false, '555555', 10);
  userCell.alignment = { horizontal: 'center' };
  ws.getRow(3).height = 18;

  ws.getRow(4).height = 10;

  // --- Tarjetas de resumen ---
  const resumen = [
    { label: '💰 Ingresos', monto: totalIngresos, color: COLOR_INCOME },
    { label: '💸 Egresos', monto: totalEgresos, color: COLOR_EXPENSE },
    { label: '🧮 Balance', monto: balance, color: balance >= 0 ? COLOR_BALANCE_POS : COLOR_BALANCE_NEG },
  ];

  resumen.forEach(({ label, monto, color }, i) => {
    const col = String.fromCharCode(65 + i);     // A, B, C
    const colNext = String.fromCharCode(65 + i); // same
    const labelCell = ws.getCell(`${col}5`);
    labelCell.value = label;
    labelCell.font = cellFont(true, 'FFFFFF', 11);
    labelCell.fill = fillSolid(color);
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.border = border();
    ws.getRow(5).height = 24;

    const montoCell = ws.getCell(`${colNext}6`);
    montoCell.value = clpStr(monto);
    montoCell.font = cellFont(true, color, 14);
    montoCell.alignment = { horizontal: 'center', vertical: 'middle' };
    montoCell.fill = fillSolid('F8FAFB');
    montoCell.border = border();
    ws.getRow(6).height = 28;
  });

  // Column D: empty in summary cards
  ws.getRow(7).height = 12;

  // --- Desglose por categoría ---
  const categorias = new Map<string, { ingresos: number; egresos: number }>();
  for (const m of movimientos) {
    const cat = m.categoria ?? 'Sin categoría';
    if (!categorias.has(cat)) categorias.set(cat, { ingresos: 0, egresos: 0 });
    const entry = categorias.get(cat)!;
    if (m.tipo === 'ingreso') entry.ingresos += Number(m.monto);
    else entry.egresos += Number(m.monto);
  }

  if (categorias.size > 0) {
    const headers = ['Categoría', 'Ingresos', 'Egresos', 'Neto'];
    const hRow = ws.addRow(headers);
    hRow.eachCell((cell) => {
      cell.font = cellFont(true, 'FFFFFF', 10);
      cell.fill = fillSolid(COLOR_HEADER);
      cell.alignment = { horizontal: 'center' };
      cell.border = border();
    });
    hRow.height = 20;

    let rowIdx = 0;
    for (const [cat, { ingresos: ing, egresos: egr }] of categorias) {
      const neto = ing - egr;
      const row = ws.addRow([cat, clpStr(ing), clpStr(egr), clpStr(neto)]);
      row.eachCell((cell, col) => {
        cell.fill = fillSolid(rowIdx % 2 === 0 ? 'FFFFFF' : COLOR_ACCENT);
        cell.border = border();
        cell.alignment = { horizontal: col === 1 ? 'left' : 'center' };
        if (col === 4) {
          cell.font = cellFont(true, neto >= 0 ? COLOR_INCOME : COLOR_EXPENSE, 10);
        } else {
          cell.font = cellFont(false, '333333', 10);
        }
      });
      row.height = 18;
      rowIdx++;
    }

    // Total row
    const totalRow = ws.addRow(['TOTAL', clpStr(totalIngresos), clpStr(totalEgresos), clpStr(balance)]);
    totalRow.eachCell((cell, col) => {
      cell.font = cellFont(true, col === 4 ? (balance >= 0 ? COLOR_INCOME : COLOR_EXPENSE) : COLOR_HEADER, 10);
      cell.fill = fillSolid(COLOR_TOTAL_BG);
      cell.border = border();
      cell.alignment = { horizontal: col === 1 ? 'left' : 'center' };
    });
    totalRow.height = 20;
  }

  // Pie de página
  ws.addRow([]);
  const footer = ws.addRow(['Generado por Abakus 🧮 · heyabakus']);
  footer.getCell(1).font = cellFont(false, '999999', 9);
  ws.mergeCells(`A${footer.number}:D${footer.number}`);
  footer.getCell(1).alignment = { horizontal: 'center' };
}

function agregarHojaMovimientos(wb: ExcelJS.Workbook, movimientos: Movimiento[], periodo: Periodo): void {
  const ws = wb.addWorksheet('Movimientos');
  ws.columns = [
    { key: 'num', width: 8 },
    { key: 'fecha', width: 12 },
    { key: 'tipo', width: 12 },
    { key: 'monto', width: 18 },
    { key: 'categoria', width: 22 },
    { key: 'descripcion', width: 40 },
  ];

  // Título
  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = `Detalle de Movimientos — ${periodo.label}`;
  t.font = cellFont(true, 'FFFFFF', 13);
  t.fill = fillSolid(COLOR_HEADER);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Encabezados
  const headers = ['#', 'Fecha', 'Tipo', 'Monto', 'Categoría', 'Descripción'];
  const hRow = ws.addRow(headers);
  hRow.eachCell((cell) => {
    cell.font = cellFont(true, 'FFFFFF', 10);
    cell.fill = fillSolid('2C3E6B');
    cell.alignment = { horizontal: 'center' };
    cell.border = border();
  });
  hRow.height = 20;

  const sorted = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  sorted.forEach((m, i) => {
    const esIngreso = m.tipo === 'ingreso';
    const row = ws.addRow([
      m.correlativo != null ? `#${m.correlativo}` : '—',
      fechaStr(m.fecha),
      esIngreso ? '💰 Ingreso' : '💸 Egreso',
      clpStr(Number(m.monto)),
      m.categoria ?? '—',
      m.descripcion ?? '—',
    ]);
    row.eachCell((cell, col) => {
      cell.fill = fillSolid(i % 2 === 0 ? 'FFFFFF' : COLOR_ACCENT);
      cell.border = border();
      cell.alignment = { horizontal: col === 6 ? 'left' : 'center', wrapText: col === 6 };
      if (col === 4) {
        cell.font = cellFont(true, esIngreso ? COLOR_INCOME : COLOR_EXPENSE, 10);
      } else if (col === 1) {
        cell.font = cellFont(true, '888888', 10);
      } else {
        cell.font = cellFont(false, '333333', 10);
      }
    });
    row.height = 17;
  });

  if (movimientos.length === 0) {
    const empty = ws.addRow(['Sin movimientos en este período.', '', '', '', '', '']);
    ws.mergeCells(`A${empty.number}:F${empty.number}`);
    empty.getCell(1).alignment = { horizontal: 'center' };
    empty.getCell(1).font = cellFont(false, '999999', 10);
  }
}

/** Plantilla descargable (.xlsx) para que el usuario complete y reenvíe por WhatsApp. */
export async function generarPlantillaExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Abakus';
  wb.created = new Date();

  const ws = wb.addWorksheet('Movimientos');
  ws.columns = [
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 22 },
    { width: 36 },
  ];

  ws.mergeCells('A1:E1');
  const t = ws.getCell('A1');
  t.value = '🧮 ABAKUS — Plantilla de carga masiva';
  t.font = cellFont(true, 'FFFFFF', 13);
  t.fill = fillSolid(COLOR_HEADER);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:E2');
  const nota = ws.getCell('A2');
  nota.value = 'Una fila por movimiento. Tipo: "ingreso" o "egreso". Fecha: DD/MM/AAAA. No borres los encabezados de la fila 3.';
  nota.font = cellFont(false, '555555', 9);
  nota.alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(2).height = 28;

  const headers = ['Fecha', 'Tipo', 'Monto', 'Categoría', 'Descripción'];
  const hRow = ws.addRow(headers);
  hRow.eachCell((cell) => {
    cell.font = cellFont(true, 'FFFFFF', 10);
    cell.fill = fillSolid('2C3E6B');
    cell.alignment = { horizontal: 'center' };
    cell.border = border();
  });
  hRow.height = 20;

  const ejemplos: [string, string, number, string, string][] = [
    ['01/06/2026', 'ingreso', 80000, 'Diseño web', 'Proyecto landing page cliente X'],
    ['02/06/2026', 'egreso', 15000, 'Internet', 'Pago mensual'],
  ];

  ejemplos.forEach(([fecha, tipo, monto, categoria, descripcion], i) => {
    const row = ws.addRow([fecha, tipo, monto, categoria, descripcion]);
    row.eachCell((cell, col) => {
      cell.fill = fillSolid(i % 2 === 0 ? 'FFFFFF' : COLOR_ACCENT);
      cell.border = border();
      cell.font = cellFont(false, '888888', 10);
      cell.alignment = { horizontal: col === 5 ? 'left' : 'center' };
    });
    row.height = 17;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function agregarHojaCuentas(wb: ExcelJS.Workbook, cuentas: CuentaPorCobrar[]): void {
  const ws = wb.addWorksheet('Cuentas por Cobrar');
  ws.columns = [
    { width: 24 },
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 34 },
  ];

  ws.mergeCells('A1:E1');
  const t = ws.getCell('A1');
  t.value = 'Cuentas por Cobrar Pendientes';
  t.font = cellFont(true, 'FFFFFF', 13);
  t.fill = fillSolid(COLOR_HEADER);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  const headers = ['Contraparte', 'Monto', 'Vencimiento', 'Estado', 'Descripción'];
  const hRow = ws.addRow(headers);
  hRow.eachCell((cell) => {
    cell.font = cellFont(true, 'FFFFFF', 10);
    cell.fill = fillSolid('2C3E6B');
    cell.alignment = { horizontal: 'center' };
    cell.border = border();
  });
  hRow.height = 20;

  const pendientes = cuentas.filter((c) => !c.pagado);
  const total = pendientes.reduce((s, c) => s + Number(c.monto), 0);

  pendientes.forEach((c, i) => {
    const row = ws.addRow([
      c.contraparte ?? 'Sin nombre',
      clpStr(Number(c.monto)),
      c.fecha_vencimiento ? fechaStr(c.fecha_vencimiento) : '—',
      '⏳ Pendiente',
      c.descripcion ?? '—',
    ]);
    row.eachCell((cell, col) => {
      cell.fill = fillSolid(i % 2 === 0 ? 'FFFFFF' : COLOR_ACCENT);
      cell.border = border();
      cell.alignment = { horizontal: col === 1 || col === 5 ? 'left' : 'center' };
      cell.font = cellFont(col === 2, col === 2 ? COLOR_EXPENSE : '333333', 10);
    });
    row.height = 17;
  });

  const totalRow = ws.addRow(['TOTAL PENDIENTE', clpStr(total), '', '', '']);
  totalRow.eachCell((cell, col) => {
    cell.font = cellFont(true, col <= 2 ? COLOR_EXPENSE : '333333', 10);
    cell.fill = fillSolid(COLOR_TOTAL_BG);
    cell.border = border();
    cell.alignment = { horizontal: col <= 2 ? 'left' : 'center' };
  });
  totalRow.height = 20;
}
