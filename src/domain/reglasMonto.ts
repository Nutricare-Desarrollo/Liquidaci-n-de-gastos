import type { Moneda, ReglaMonto } from "./types.js";

export interface ResultadoLimite {
  excede: boolean;
  alerta: string; // "" o "🔴 Excede limite"
  topeAplicado: number | null;
}

/**
 * Reglas de monto / exceso (traspaso 4.7). Solo aplica a categorias con regla
 * (Desayuno / Almuerzo / Cena). Compara el total de la factura contra el tope
 * de la MONEDA DEL INFORME. Sin conversiones. No frena: solo exige justificar.
 */
export function evaluarLimite(params: {
  categoriaCodigo: string;
  monto: number;
  monedaInforme: Moneda;
  reglas: ReglaMonto[];
}): ResultadoLimite {
  const regla = params.reglas.find(
    (r) => r.categoriaCodigo === params.categoriaCodigo && r.activo,
  );
  if (!regla) return { excede: false, alerta: "", topeAplicado: null };

  const tope = params.monedaInforme === "USD" ? regla.montoMaxUSD : regla.montoMaxCRC;
  const excede = params.monto > tope;
  return {
    excede,
    alerta: excede ? "🔴 Excede limite" : "",
    topeAplicado: tope,
  };
}
