// =====================================================================
//  Clave numerica de 50 digitos (Costa Rica, Hacienda v4.x)
//  Desglose (Fundamentos_datos, seccion 3.3):
//    1-3   codigo de pais (506)
//    4-9   fecha emision DDMMAA
//    10-21 cedula del emisor (12)
//    22-41 numeracion consecutiva (20): sucursal(3)+terminal(5)+tipoDoc(2)+consecutivo(10)
//    42    situacion del comprobante (1 normal / 2 contingencia / 3 sin internet)
//    43-50 codigo de seguridad (8)
//  NOTA: el desglose puede variar entre v4.3/v4.4; confirmar en anexos de
//        Hacienda antes de endurecer la validacion.
// =====================================================================

export interface ClaveDesglosada {
  codigoPais: string;
  fechaEmision: string; // DDMMAA
  cedulaEmisor: string;
  numeracionConsecutiva: string;
  sucursal: string;
  terminal: string;
  tipoDocumento: string; // "01" factura, "04" tiquete, etc.
  consecutivo: string;
  situacion: string;
  codigoSeguridad: string;
}

const SOLO_DIGITOS_50 = /^\d{50}$/;

/** Normaliza texto (quita espacios y saltos) — usado por el cruce. */
export function normalizar(texto: string): string {
  return texto.replace(/\s+/g, "");
}

/** Valida largo 50, solo digitos y pais = 506. */
export function esClaveValida(clave: string): boolean {
  const c = normalizar(clave);
  return SOLO_DIGITOS_50.test(c) && c.slice(0, 3) === "506";
}

/** Extrae un candidato de clave (50 digitos) desde texto libre de OCR. */
export function extraerClaveDeTexto(texto: string): string | null {
  const m = normalizar(texto).match(/\d{50}/);
  return m ? m[0] : null;
}

export function desglosarClave(clave: string): ClaveDesglosada | null {
  const c = normalizar(clave);
  if (!esClaveValida(c)) return null;
  return {
    codigoPais: c.slice(0, 3),
    fechaEmision: c.slice(3, 9),
    cedulaEmisor: c.slice(9, 21),
    numeracionConsecutiva: c.slice(21, 41),
    sucursal: c.slice(21, 24),
    terminal: c.slice(24, 29),
    tipoDocumento: c.slice(29, 31),
    consecutivo: c.slice(31, 41),
    situacion: c.slice(41, 42),
    codigoSeguridad: c.slice(42, 50),
  };
}
