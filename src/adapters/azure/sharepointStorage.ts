// StoragePort sobre SharePoint (Microsoft Graph). El PDF que llega por
// correo y los adjuntos de gastos se guardan en una biblioteca de documentos
// de SharePoint (donde Nutricare ya los guarda hoy).
// Requiere token de app con Sites.ReadWrite.All (cuenta de servicio Entra).
import type { StoragePort } from "../../ports/index.js";
import type { EntraTokenProvider } from "./entraToken.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export interface SharePointConfig {
  siteId: string; // p.ej. contoso.sharepoint.com,<guid>,<guid>
  driveId?: string; // opcional: biblioteca especifica; si no, se usa el drive por defecto
  carpetaBase?: string; // p.ej. "Comprobantes Gastos"
}

export class SharePointStorage implements StoragePort {
  constructor(
    private readonly cfg: SharePointConfig,
    private readonly tokens: EntraTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async guardar(params: { contenido: Buffer; ruta: string; mimeType: string }): Promise<string> {
    const token = await this.tokens.getToken(GRAPH_SCOPE);
    const carpeta = this.cfg.carpetaBase ? `${this.cfg.carpetaBase}/` : "";
    const path = encodeURI(`${carpeta}${params.ruta}`);
    const drive = this.cfg.driveId
      ? `${GRAPH}/drives/${this.cfg.driveId}`
      : `${GRAPH}/sites/${this.cfg.siteId}/drive`;
    // Subida simple (archivos < 4 MB). Para mayores, usar upload session.
    const url = `${drive}/root:/${path}:/content`;
    const res = await this.fetchImpl(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": params.mimeType },
      body: params.contenido,
    });
    if (!res.ok) throw new Error(`SharePoint PUT ${res.status}: ${await res.text().catch(() => "")}`);
    const item = (await res.json()) as { webUrl?: string; id?: string };
    return item.webUrl ?? `${drive}/items/${item.id}`;
  }
}
