import { normalizar } from "./clave.js";

// Cruce foto <-> factura (traspaso 4.3).
// Empareja si la CLAVE de la factura aparece dentro del TEXTO OCR de la foto,
// comparando sin espacios ni saltos de linea en ambos lados.
// Nunca se confia en el OCR para montos: solo para hallar la clave.
export function cruza(textoOCR: string, claveFactura: string): boolean {
  const ocr = normalizar(textoOCR ?? "");
  const clave = normalizar(claveFactura ?? "");
  if (clave.length === 0) return false;
  return ocr.includes(clave);
}

/**
 * Dado el texto OCR de una captura y una lista de facturas candidatas,
 * devuelve la primera factura cuya clave aparece en el OCR.
 */
export function encontrarFactura<T extends { clave: string }>(
  textoOCR: string,
  facturas: T[],
): T | null {
  return facturas.find((f) => cruza(textoOCR, f.clave)) ?? null;
}
