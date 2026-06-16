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

function buildPeriodo(anio: number, mes: number): Periodo {
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${ultimoDia}`,
    label: `${MESES_ES[mes]} ${anio}`,
  };
}

export function mesActual(): Periodo {
  const hoy = new Date();
  return buildPeriodo(hoy.getFullYear(), hoy.getMonth() + 1);
}

export function mesPasado(): Periodo {
  const hoy = new Date();
  const mes = hoy.getMonth(); // 0 = enero → mes pasado
  const anio = mes === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();
  return buildPeriodo(anio, mes === 0 ? 12 : mes);
}

/** Período de N meses atrás respecto al actual. N negativo = meses adelante. */
export function periodoMesesAtras(n: number): Periodo {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - n, 1);
  return buildPeriodo(fecha.getFullYear(), fecha.getMonth() + 1);
}

/** Diferencia en meses entre un período y el mes actual (positivo = futuro). */
export function diferenciaMeses(periodo: Periodo): number {
  const hoy = new Date();
  const [anio, mes] = periodo.desde.split('-').map(Number);
  return (anio - hoy.getFullYear()) * 12 + (mes - (hoy.getMonth() + 1));
}

/**
 * Detecta un mes mencionado en el texto (sin asumir mes actual por defecto).
 * Si el mes ya pasó este año y no se especifica año, asume el próximo año.
 * Devuelve null si no se menciona ningún mes.
 */
export function parsearMesObjetivo(texto: string): Periodo | null {
  const t = texto.toLowerCase();
  const hoy = new Date();

  for (const [nombre, num] of Object.entries(MESES)) {
    if (t.includes(nombre)) {
      const matchAnio = t.match(/\b(20\d{2})\b/);
      let anio = matchAnio ? Number(matchAnio[1]) : hoy.getFullYear();
      if (!matchAnio && num < hoy.getMonth() + 1) {
        anio += 1;
      }
      return buildPeriodo(anio, num);
    }
  }
  return null;
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

  return buildPeriodo(anio, mes);
}
