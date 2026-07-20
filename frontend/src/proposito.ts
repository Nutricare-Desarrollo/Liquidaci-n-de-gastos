// Config por PROPOSITO (mirror del backend). liq.proposito = clave del selector.
export const PROPOSITOS: { value: string; label: string }[] = [
  { value: "TARJETA_CORPORATIVA", label: "TARJETA CORPORATIVA" },
  { value: "FONDOS_PERSONALES", label: "PAGO CON FONDOS PERSONALES" },
  { value: "CAJA_CHICA_TESORERIA", label: "CAJA CHICA - TESORERÍA" },
  { value: "CAJA_CHICA_ALMACEN", label: "CAJA CHICA - ALMACÉN" },
  { value: "LIQUIDACION_ANTICIPOS", label: "LIQUIDACIÓN ANTICIPOS" },
  { value: "ANTICIPOS", label: "ANTICIPOS" },
  { value: "KILOMETRAJE", label: "KILOMETRAJE" },
];

export function labelProposito(clave: string): string {
  return PROPOSITOS.find((p) => p.value === clave)?.label ?? clave;
}

const CATEGORIA_ANTICIPOS = "Anticipo_Empleados";
const CATEGORIAS_KM = ["KILOMETRAJE", "COMBUSTIBLE", "COMBUSTIBLES"];

/** Codigos de categoria permitidos, o null = todas. */
export function categoriasPermitidas(clave: string): string[] | null {
  if (clave === "ANTICIPOS") return [CATEGORIA_ANTICIPOS];
  if (clave === "KILOMETRAJE") return CATEGORIAS_KM;
  return null;
}

export function esKilometraje(clave: string): boolean { return clave === "KILOMETRAJE"; }
export function esAnticipos(clave: string): boolean { return clave === "ANTICIPOS"; }
