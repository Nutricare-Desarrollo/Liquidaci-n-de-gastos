// =====================================================================
//  Configuracion por PROPOSITO del informe:
//   - categorias permitidas
//   - reglas especiales (un solo gasto, campos de kilometraje)
//  Fuente: revision con Contabilidad (jul-2026).
// =====================================================================
import type { Proposito } from "./types.js";

/** Mapea la clave del selector (front) al valor de dominio/FO (Purpose). */
export const PROPOSITO_POR_CLAVE: Record<string, Proposito> = {
  TARJETA_CORPORATIVA: "TARJETA CORPORATIVA",
  FONDOS_PERSONALES: "PAGO CON FONDOS PERSONALES",
  CAJA_CHICA_TESORERIA: "CAJA CHICA - TESORERÍA",
  CAJA_CHICA_ALMACEN: "CAJA CHICA - ALMACÉN",
  LIQUIDACION_ANTICIPOS: "LIQUIDACIÓN ANTICIPOS",
  ANTICIPOS: "ANTICIPOS",
  KILOMETRAJE: "KILOMETRAJE",
};

export function propositoDeClave(clave: string): Proposito {
  return PROPOSITO_POR_CLAVE[clave] ?? "TARJETA CORPORATIVA";
}

/** Codigo exacto (FO) de la categoria de anticipos. */
export const CATEGORIA_ANTICIPOS = "Anticipo_Empleados";
/** Categorias validas para KILOMETRAJE (sandbox usa COMBUSTIBLE singular). */
export const CATEGORIAS_KILOMETRAJE = ["KILOMETRAJE", "COMBUSTIBLE", "COMBUSTIBLES"];

/** Lista blanca de categorias, o null = todas permitidas. */
export function categoriasPermitidas(p: Proposito): string[] | null {
  switch (p) {
    case "ANTICIPOS":
      return [CATEGORIA_ANTICIPOS];
    case "KILOMETRAJE":
      return CATEGORIAS_KILOMETRAJE;
    default:
      return null;
  }
}

export function categoriaEsValida(p: Proposito, codigo: string): boolean {
  const permitidas = categoriasPermitidas(p);
  return !permitidas || permitidas.includes(codigo);
}

/** ANTICIPOS: un unico gasto por liquidacion. */
export function permiteUnSoloGasto(p: Proposito): boolean {
  return p === "ANTICIPOS";
}

/** KILOMETRAJE: requiere zona + kilometros. */
export function requiereKilometraje(p: Proposito): boolean {
  return p === "KILOMETRAJE";
}
