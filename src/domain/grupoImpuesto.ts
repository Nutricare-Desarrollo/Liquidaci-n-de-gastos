// Grupo de impuesto de articulos (traspaso 4.5).
// Default = tax item group de la categoria (texto, ej. "IVA 13%").
// En el gasto es un lookup al catalogo de grupos (match por nombre exacto).
// La TARIFA va embebida en el nombre; no es dato aparte.
// El Name debe coincidir caracter por caracter con FO.
export function resolverGrupoImpuesto(params: {
  taxItemGroupCategoria: string; // default de la categoria
  gruposDisponibles: string[]; // Names del catalogo (valores exactos de FO)
}): { grupo: string; existeEnCatalogo: boolean } {
  const grupo = (params.taxItemGroupCategoria ?? "").trim();
  const existeEnCatalogo = params.gruposDisponibles.some((g) => g === grupo);
  return { grupo, existeEnCatalogo };
}
