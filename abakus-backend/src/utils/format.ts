/** Formatea un monto en pesos chilenos: 50000 -> "$50.000". */
export function clp(monto: number): string {
  return `$${Math.round(monto).toLocaleString('es-CL')}`;
}
