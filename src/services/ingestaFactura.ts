// =====================================================================
//  Servicio: ingesta de factura desde correo entrante (traspaso 3 y 4.1).
//  - Decodifica el adjunto (viene en base64 -> binario, si no se corrompe).
//  - Parsea el XML (ignora namespaces).
//  - Descarta la respuesta de Hacienda (sin total).
//  - Guarda el PDF adjunto en storage y liga la URL.
//  - Dedup por clave.
// =====================================================================
import { parseFactura, FacturaIgnorableError } from "../domain/parseFactura.js";
import { CEDULA_NUTRICARE, type FacturaParseada } from "../domain/types.js";
import type { CorreoEntrante, StoragePort } from "../ports/index.js";

export interface FacturaPersistida extends FacturaParseada {
  urlPdf: string | null;
  esDeLaEmpresa: boolean; // receptor == cedula juridica Nutricare
}

export interface FacturaRepo {
  existePorClave(clave: string): Promise<boolean>;
  guardar(f: FacturaPersistida): Promise<void>;
}

/** Decodifica base64 de correo a binario. Error clasico: guardar el base64 crudo. */
export function decodeBase64(contenidoBase64: string): Buffer {
  return Buffer.from(contenidoBase64, "base64");
}

export async function ingestarCorreo(
  correo: CorreoEntrante,
  deps: { storage: StoragePort; repo: FacturaRepo },
): Promise<{ ingestadas: number; ignoradas: number }> {
  let ingestadas = 0;
  let ignoradas = 0;

  const xmls = correo.adjuntos.filter((a) => a.nombre.toLowerCase().endsWith(".xml"));
  const pdfs = correo.adjuntos.filter((a) => a.nombre.toLowerCase().endsWith(".pdf"));

  for (const adjunto of xmls) {
    const xml = decodeBase64(adjunto.contenidoBase64).toString("utf-8");

    let factura: FacturaParseada;
    try {
      factura = parseFactura(xml);
    } catch (e) {
      if (e instanceof FacturaIgnorableError) {
        ignoradas++;
        continue;
      }
      throw e;
    }

    // Dedup por clave.
    if (await deps.repo.existePorClave(factura.clave)) {
      ignoradas++;
      continue;
    }

    // Guardar el PDF adjunto (decodificado a binario) y ligar la URL.
    let urlPdf: string | null = null;
    const pdf = pdfs[0];
    if (pdf) {
      urlPdf = await deps.storage.guardar({
        contenido: decodeBase64(pdf.contenidoBase64),
        ruta: `facturas/${factura.clave}.pdf`,
        mimeType: "application/pdf",
      });
    }

    await deps.repo.guardar({
      ...factura,
      urlPdf,
      esDeLaEmpresa: factura.receptorIdentificacion === CEDULA_NUTRICARE,
    });
    ingestadas++;
  }

  return { ingestadas, ignoradas };
}
