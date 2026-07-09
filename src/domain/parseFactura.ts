// =====================================================================
//  Ingesta del XML (traspaso 4.1).
//  Parsear IGNORANDO namespaces (equivalente a xpath con local-name()).
//  El XML es la fuente de verdad financiera.
// =====================================================================
import { XMLParser } from "fast-xml-parser";
import { toNum } from "./num.js";
import { situacionFiscal } from "./situacionFiscal.js";
import type { FacturaParseada, Moneda } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: true,
  // Quitar cualquier prefijo de namespace: "dsig:Foo" -> "Foo", "ds:Bar" -> "Bar".
  // fast-xml-parser no expone local-name(), asi que renombramos las tags.
  transformTagName: (tag: string) => {
    const i = tag.indexOf(":");
    return i === -1 ? tag : tag.slice(i + 1);
  },
  parseTagValue: false, // conservar texto crudo; forzamos a numero con toNum
  trimValues: true,
});

/** Busca la primera aparicion de una tag (por nombre local) en un objeto anidado. */
function findFirst(node: unknown, name: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (name in obj) return obj[name];
  for (const key of Object.keys(obj)) {
    const found = findFirst(obj[key], name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function text(node: unknown, name: string): string {
  const v = findFirst(node, name);
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "";
  return String(v).trim();
}

function firstOf<T>(v: T | T[] | undefined): T | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export class FacturaIgnorableError extends Error {}

/**
 * Parsea el XML de una factura electronica.
 * Lanza FacturaIgnorableError si es la respuesta de Hacienda (sin total).
 */
export function parseFactura(xml: string): FacturaParseada {
  const root = parser.parse(xml);

  const clave = text(root, "Clave").replace(/\s+/g, "");
  const totalComprobante = toNum(text(root, "TotalComprobante"));

  // Descartar el XML de respuesta de Hacienda: no trae total.
  if (!clave || totalComprobante === 0 && text(root, "TotalComprobante") === "") {
    throw new FacturaIgnorableError("XML sin total: respuesta de Hacienda, ignorar.");
  }

  const totalImpuesto = toNum(text(root, "TotalImpuesto"));
  const totalGravado = toNum(text(root, "TotalGravado"));
  const totalExento = toNum(text(root, "TotalExento"));
  const totalNoSujeto = toNum(text(root, "TotalNoSujeto"));

  // Emisor / receptor: tomar la Identificacion dentro de cada bloque.
  const emisor = findFirst(root, "Emisor");
  const receptor = findFirst(root, "Receptor");
  const emisorId = text(findFirst(emisor, "Identificacion"), "Numero");
  const receptorId = text(findFirst(receptor, "Identificacion"), "Numero");
  const emisorNombre = text(emisor, "Nombre");

  // Moneda del XML (ResumenFactura/CodigoTipoMoneda/CodigoMoneda).
  const monedaRaw = text(root, "CodigoMoneda").toUpperCase();
  const moneda: Moneda = monedaRaw === "CRC" || monedaRaw === "USD" ? monedaRaw : "Otra";

  // Primera linea de detalle SIEMPRE (regla: combustible = 1 sola linea).
  const detalleServicio = findFirst(root, "DetalleServicio");
  const lineas = (detalleServicio as Record<string, unknown> | undefined)?.["LineaDetalle"];
  const primeraLinea = firstOf(lineas as unknown) ?? {};
  const cantidad = toNum(text(primeraLinea, "Cantidad"));
  const detalle = text(primeraLinea, "Detalle");

  return {
    clave,
    consecutivo: text(root, "NumeroConsecutivo"),
    fechaEmision: text(root, "FechaEmision"),
    emisorNombre,
    emisorIdentificacion: emisorId,
    receptorIdentificacion: receptorId,
    totalComprobante,
    totalImpuesto,
    totalGravado,
    totalExento,
    totalNoSujeto,
    moneda,
    situacionFiscal: situacionFiscal({ totalImpuesto, totalExento, totalNoSujeto }),
    cantidad,
    detalle,
  };
}
