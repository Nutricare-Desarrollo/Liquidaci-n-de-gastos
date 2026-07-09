// CorreoEntrantePort sobre Microsoft Graph (buzon M365 de facturacion).
// Poll de mensajes no leidos con adjuntos; extrae los adjuntos (base64),
// llama al handler y marca el mensaje como leido. Se dispara por cron.
import type { CorreoEntrante, CorreoEntrantePort } from "../../ports/index.js";
import type { EntraTokenProvider } from "./entraToken.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export class GraphCorreoAdapter implements CorreoEntrantePort {
  private handler?: (correo: CorreoEntrante) => Promise<void>;

  constructor(
    private readonly mailboxUserId: string,
    private readonly tokens: EntraTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  onCorreo(handler: (correo: CorreoEntrante) => Promise<void>): void {
    this.handler = handler;
  }

  /** Ejecuta un ciclo de poll. Llamar desde un cron / endpoint programado. */
  async poll(): Promise<{ procesados: number }> {
    if (!this.handler) throw new Error("GraphCorreoAdapter: falta onCorreo(handler)");
    const token = await this.tokens.getToken(GRAPH_SCOPE);
    const headers = { Authorization: `Bearer ${token}` };

    const listUrl =
      `${GRAPH}/users/${encodeURIComponent(this.mailboxUserId)}/messages` +
      `?$filter=isRead eq false and hasAttachments eq true&$select=id,subject&$top=25`;
    const listRes = await this.fetchImpl(listUrl, { headers });
    if (!listRes.ok) throw new Error(`Graph list ${listRes.status}: ${await listRes.text().catch(() => "")}`);
    const list = (await listRes.json()) as { value: Array<{ id: string; subject: string }> };

    let procesados = 0;
    for (const msg of list.value) {
      const attUrl = `${GRAPH}/users/${encodeURIComponent(this.mailboxUserId)}/messages/${msg.id}/attachments`;
      const attRes = await this.fetchImpl(attUrl, { headers });
      const atts = (await attRes.json()) as {
        value: Array<{ "@odata.type": string; name: string; contentType: string; contentBytes?: string }>;
      };

      const correo: CorreoEntrante = {
        asunto: msg.subject ?? "",
        adjuntos: atts.value
          .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && a.contentBytes)
          .map((a) => ({ nombre: a.name, contenidoBase64: a.contentBytes!, mimeType: a.contentType })),
      };

      await this.handler(correo);

      // Marcar leido para no reprocesar.
      await this.fetchImpl(`${GRAPH}/users/${encodeURIComponent(this.mailboxUserId)}/messages/${msg.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      procesados++;
    }
    return { procesados };
  }
}
