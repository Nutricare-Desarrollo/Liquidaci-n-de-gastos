// NotificacionPort que dispara la aprobacion en Teams. El "Teams Approval"
// se crea con un flujo de Power Automate (trigger HTTP) al que llamamos aqui.
// Asi replicamos el comportamiento actual (approval de Teams al aprobador).
import type { NotificacionPort } from "../../ports/index.js";

export interface TeamsAprobacionConfig {
  approvalsFlowUrl: string; // URL del trigger HTTP del flujo de Power Automate
}

export class TeamsAprobacionNotificacion implements NotificacionPort {
  constructor(private readonly cfg: TeamsAprobacionConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private async post(payload: Record<string, unknown>): Promise<void> {
    if (!this.cfg.approvalsFlowUrl) return; // sin flujo configurado: no-op
    const res = await this.fetchImpl(this.cfg.approvalsFlowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Flujo de aprobacion ${res.status}: ${await res.text().catch(() => "")}`);
  }

  async notificar(params: { paraEmail: string; titulo: string; cuerpo: string }): Promise<void> {
    await this.post({ tipo: "notificacion", paraEmail: params.paraEmail, titulo: params.titulo, cuerpo: params.cuerpo });
  }

  async solicitarAprobacion(params: { aprobadorEmail: string; aprobadorNombre?: string; titulo: string; liquidacionId: string; liquidacionName?: string }): Promise<void> {
    await this.post({ tipo: "aprobacion", ...params });
  }
}
