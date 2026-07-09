// StoragePort sobre Azure Blob. Usa una URL de contenedor con SAS de
// escritura (no requiere firmar SharedKey a mano). PUT Block Blob.
import type { StoragePort } from "../../ports/index.js";

export class AzureBlobStorage implements StoragePort {
  constructor(
    private readonly containerSasUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async guardar(params: { contenido: Buffer; ruta: string; mimeType: string }): Promise<string> {
    // Inserta la ruta del blob antes del query string del SAS.
    const [base, sas] = this.containerSasUrl.split("?");
    const blobUrl = `${base}/${encodeURI(params.ruta)}${sas ? `?${sas}` : ""}`;

    const res = await this.fetchImpl(blobUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": params.mimeType,
        "Content-Length": String(params.contenido.length),
      },
      body: params.contenido,
    });
    if (!res.ok) {
      throw new Error(`Blob PUT ${res.status}: ${await res.text().catch(() => "")}`);
    }
    // Devolver la URL sin el SAS (la lectura se resuelve por otra via/SAS de lectura).
    return `${base}/${encodeURI(params.ruta)}`;
  }
}
