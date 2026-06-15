const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4,
  mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const MESES_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface Periodo {
  desde: string;  // YYYY-MM-DD
  hasta: string;  // YYYY-MM-DD
  label: string;  // "Junio 2026"
}

/**
 * Parsea el texto del usuario para detectar el período del reporte.
 * Soporta: "reporte", "reporte mayo", "reporte mayo 2025".
 * Por defecto devuelve el mes actual.
 */
export function parsearPeriodo(texto: string): Periodo {
  const t = texto.toLowerCase();
  const hoy = new Date();

  let mes = hoy.getMonth() + 1;
  let anio = hoy.getFullYear();

  for (const [nombre, num] of Object.entries(MESES)) {
    if (t.includes(nombre)) {
      mes = num;
      const matchAnio = t.match(/\b(20\d{2})\b/);
      if (matchAnio) {
        anio = Number(matchAnio[1]);
      }
      break;
    }
  }

  const ultimoDia = new Date(anio, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');

  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${ultimoDia}`,
    label: `${MESES_ES[mes]} ${anio}`,
  };
}
