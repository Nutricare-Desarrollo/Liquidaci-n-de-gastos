import { TipoGasolina } from "./types.js";

export const CATEGORIA_COMBUSTIBLE = "COMBUSTIBLES"; // plural y exacta (leccion FO)

export interface DatosCombustible {
  litros: number;
  tipo: TipoGasolina | null;
}

/**
 * Heuristica del tipo de combustible (traspaso 4.6). Solo si la categoria
 * es COMBUSTIBLES. Litros = cantidad de la linea (directo del XML).
 * El orden importa: Diesel antes que Gasolina.
 */
export function detectarCombustible(cantidad: number, detalle: string): DatosCombustible {
  const d = (detalle ?? "").toUpperCase();
  let tipo: TipoGasolina | null = null;
  if (d.includes("DIESEL") || d.includes("DIÉSEL")) tipo = TipoGasolina.Diesel;
  else if (d.includes("GAS LP")) tipo = TipoGasolina.GasLP;
  else if (d.includes("GASOLINA") || d.includes("SUPER") || d.includes("REGULAR"))
    tipo = TipoGasolina.Gasolina;
  return { litros: cantidad, tipo };
}
