// ===== Multimoneda =====
// Abakus opera en varios países de LATAM (y más). Cada usuario tiene UNA moneda
// (la de su país), que se infiere del prefijo telefónico y se confirma/ajusta en
// la conversación. Todos sus montos se guardan y muestran en esa moneda.

/** Moneda por defecto cuando no se conoce la del usuario. */
export const MONEDA_DEFAULT = 'CLP';

/** Locale usado para formatear cada moneda (separadores y símbolo correctos). */
const LOCALE_MONEDA: Record<string, string> = {
  CLP: 'es-CL', // Chile
  ARS: 'es-AR', // Argentina
  MXN: 'es-MX', // México
  COP: 'es-CO', // Colombia
  PEN: 'es-PE', // Perú
  BOB: 'es-BO', // Bolivia
  UYU: 'es-UY', // Uruguay
  PYG: 'es-PY', // Paraguay
  VES: 'es-VE', // Venezuela
  GTQ: 'es-GT', // Guatemala
  CRC: 'es-CR', // Costa Rica
  HNL: 'es-HN', // Honduras
  NIO: 'es-NI', // Nicaragua
  DOP: 'es-DO', // Rep. Dominicana
  BRL: 'pt-BR', // Brasil
  USD: 'es-419', // Ecuador, Panamá, El Salvador, etc.
  EUR: 'es-ES', // España
  GBP: 'en-GB', // Reino Unido
};

/** Prefijos telefónicos (E.164) → moneda. Se evalúan del más largo al más corto. */
const PREFIJO_MONEDA: Record<string, string> = {
  '54': 'ARS',  // Argentina
  '55': 'BRL',  // Brasil
  '56': 'CLP',  // Chile
  '57': 'COP',  // Colombia
  '58': 'VES',  // Venezuela
  '51': 'PEN',  // Perú
  '52': 'MXN',  // México
  '591': 'BOB', // Bolivia
  '593': 'USD', // Ecuador (dolarizado)
  '595': 'PYG', // Paraguay
  '598': 'UYU', // Uruguay
  '502': 'GTQ', // Guatemala
  '503': 'USD', // El Salvador (dolarizado)
  '504': 'HNL', // Honduras
  '505': 'NIO', // Nicaragua
  '506': 'CRC', // Costa Rica
  '507': 'USD', // Panamá (dolarizado)
  '34': 'EUR',  // España
  '44': 'GBP',  // Reino Unido
  '1': 'USD',   // EE.UU./Canadá (NANP)
};

// Prefijos ordenados por longitud descendente para emparejar el más específico.
const PREFIJOS_ORDENADOS = Object.keys(PREFIJO_MONEDA).sort((a, b) => b.length - a.length);

/** ¿Es un código de moneda que Abakus sabe formatear? */
export function esMonedaSoportada(code: string | null | undefined): boolean {
  return !!code && !!LOCALE_MONEDA[code.trim().toUpperCase()];
}

/** Normaliza un código de moneda a uno soportado; cae a MONEDA_DEFAULT si no se reconoce. */
export function normalizarMoneda(code: string | null | undefined): string {
  if (!code) return MONEDA_DEFAULT;
  const c = code.trim().toUpperCase();
  return LOCALE_MONEDA[c] ? c : MONEDA_DEFAULT;
}

/** Infiere la moneda a partir del teléfono del usuario (prefijo país). */
export function monedaPorTelefono(phone: string | null | undefined): string {
  const digitos = (phone ?? '').replace(/\D/g, '');
  for (const prefijo of PREFIJOS_ORDENADOS) {
    if (digitos.startsWith(prefijo)) return PREFIJO_MONEDA[prefijo];
  }
  return MONEDA_DEFAULT;
}

/**
 * Formatea un monto en la moneda indicada (símbolo y decimales según la moneda:
 * CLP/COP/PYG sin decimales, USD/PEN/MXN con dos, etc.). Ej: formatMonto(50000)
 * → "$50.000" (CLP); formatMonto(19.9, 'USD') → "US$19,90".
 */
export function formatMonto(monto: number, moneda?: string | null): string {
  const code = normalizarMoneda(moneda);
  const locale = LOCALE_MONEDA[code] ?? 'es-419';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).format(monto);
  } catch {
    return `$${Math.round(monto).toLocaleString(locale)}`;
  }
}

/** Formatea un monto en pesos chilenos. Atajo retrocompatible de formatMonto. */
export function clp(monto: number): string {
  return formatMonto(monto, 'CLP');
}
