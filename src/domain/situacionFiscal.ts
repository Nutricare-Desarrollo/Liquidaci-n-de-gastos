import type { SituacionFiscal } from "./types.js";

// Situacion fiscal (traspaso 4.2). Cada total blindado con default 0.
// Orden de prioridad estricto. Coincide con los SalesTaxGroup de FO.
export function situacionFiscal(input: {
  totalImpuesto: number;
  totalExento: number;
  totalNoSujeto: number;
}): SituacionFiscal {
  if (input.totalImpuesto > 0) return "IVA";
  if (input.totalExento > 0) return "EXENTO";
  if (input.totalNoSujeto > 0) return "NO SUJETO";
  return ""; // revisar manualmente
}
