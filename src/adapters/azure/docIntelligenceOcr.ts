// OcrPort sobre Azure AI Document Intelligence (Form Recognizer).
// Modelo prebuilt-read con el complemento de codigos de barras (barcodes),
// como indica Fundamentos_datos 3.2: primero el QR (la clave), respaldo OCR.
import type { OcrPort } from "../../ports/index.js";

export interface DocIntelligenceConfig {
  endpoint: string; // https://<recurso>.cognitiveservices.azure.com
  apiKey: string;
  apiVersion?: string;
}

export class DocIntelligenceOcr implements OcrPort {
  private readonly apiVersion: string;
  constructor(
    private readonly cfg: DocIntelligenceConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.apiVersion = cfg.apiVersion ?? "2024-11-30";
  }

  async leerTexto(imagen: Buffer): Promise<{ texto: string; confianza: number }> {
    const analyzeUrl =
      `${this.cfg.endpoint}/documentintelligence/documentModels/prebuilt-read:analyze` +
      `?api-version=${this.apiVersion}&features=barcodes`;

    // 1) Enviar la imagen. La respuesta 202 trae operation-location para el poll.
    const start = await this.fetchImpl(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.cfg.apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: imagen,
    });
    if (start.status !== 202) {
      throw new Error(`DocInt analyze ${start.status}: ${await start.text().catch(() => "")}`);
    }
    const opLocation = start.headers.get("operation-location");
    if (!opLocation) throw new Error("DocInt no devolvio operation-location");

    // 2) Poll hasta succeeded/failed.
    for (let intento = 0; intento < 30; intento++) {
      await sleep(1000);
      const poll = await this.fetchImpl(opLocation, {
        headers: { "Ocp-Apim-Subscription-Key": this.cfg.apiKey },
      });
      const data = (await poll.json()) as DocIntResult;
      if (data.status === "succeeded") {
        const texto = extraerTexto(data);
        // Confianza: DocInt Read no da un score global; usamos 1 si hubo barcode QR.
        const tieneBarcode = !!data.analyzeResult?.pages?.some((p) => (p.barcodes?.length ?? 0) > 0);
        return { texto, confianza: tieneBarcode ? 1 : 0.5 };
      }
      if (data.status === "failed") {
        throw new Error(`DocInt fallo: ${JSON.stringify(data.error ?? {})}`);
      }
    }
    throw new Error("DocInt timeout de poll");
  }
}

// Prioriza el valor del barcode/QR (la clave); si no hay, cae al texto OCR.
function extraerTexto(data: DocIntResult): string {
  const barcodes = data.analyzeResult?.pages?.flatMap((p) => p.barcodes ?? []) ?? [];
  const qr = barcodes.map((b) => b.value).filter(Boolean).join(" ");
  const content = data.analyzeResult?.content ?? "";
  return `${qr} ${content}`.trim();
}

interface DocIntResult {
  status: "notStarted" | "running" | "succeeded" | "failed";
  error?: unknown;
  analyzeResult?: {
    content?: string;
    pages?: Array<{ barcodes?: Array<{ value?: string }> }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
