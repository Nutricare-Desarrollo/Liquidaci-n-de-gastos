// Mapeo entre los strings del dominio (valores de Hacienda/FO) y los enums
// de Prisma/Postgres. El dominio conserva los strings exactos que espera FO;
// la BD usa enums seguros.
import type { Moneda, SituacionFiscal } from "../domain/types.js";

export function monedaToDb(m: Moneda): "CRC" | "USD" | "Otra" {
  return m;
}

export function situacionToDb(
  s: SituacionFiscal,
): "IVA" | "EXENTO" | "NO_SUJETO" | "SIN_DEFINIR" {
  switch (s) {
    case "IVA":
      return "IVA";
    case "EXENTO":
      return "EXENTO";
    case "NO SUJETO":
      return "NO_SUJETO";
    default:
      return "SIN_DEFINIR";
  }
}

export function situacionFromDb(
  s: "IVA" | "EXENTO" | "NO_SUJETO" | "SIN_DEFINIR",
): SituacionFiscal {
  switch (s) {
    case "IVA":
      return "IVA";
    case "EXENTO":
      return "EXENTO";
    case "NO_SUJETO":
      return "NO SUJETO";
    default:
      return "";
  }
}
