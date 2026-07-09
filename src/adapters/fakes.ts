// =====================================================================
//  Adapters FALSOS para modo demo. Permiten correr todo el flujo sin
//  Azure ni Dynamics. La conexion real (FO) se cablea al final.
// =====================================================================
import type { AuthPort, FinancePort, NotificacionPort, OcrPort, ReporteGastoFO, RespuestaFO, StoragePort } from "../ports/index.js";

// OCR falso: "lee" el contenido del archivo como texto. En demo, la foto
// enviada es base64 de un texto que incluye la clave de 50 digitos, asi
// el cruce funciona igual que con OCR real.
export class FakeOcr implements OcrPort {
  async leerTexto(imagen: Buffer): Promise<{ texto: string; confianza: number }> {
    return { texto: imagen.toString("utf-8"), confianza: 1 };
  }
}

export class FakeStorage implements StoragePort {
  public guardados: Array<{ ruta: string; bytes: number }> = [];
  async guardar(params: { contenido: Buffer; ruta: string; mimeType: string }): Promise<string> {
    this.guardados.push({ ruta: params.ruta, bytes: params.contenido.length });
    return `demo://blob/${params.ruta}`;
  }
}

// FO falso: genera un numero de reporte. Al final se reemplaza por FoHttpClient.
export class FakeFinance implements FinancePort {
  private n = 1000;
  public recibidos: ReporteGastoFO[] = [];
  async crearReporteGasto(reporte: ReporteGastoFO): Promise<RespuestaFO> {
    this.recibidos.push(reporte);
    this.n++;
    return {
      success: true,
      message: `[DEMO] Reporte con ${reporte.lineas.length} linea(s) creado (sin Dynamics).`,
      expenseReportNumber: `EXP-DEMO-${this.n}`,
      headerRecId: this.n,
    };
  }
}

export class FakeAuth implements AuthPort {
  async usuarioActual(token: string): Promise<{ id: string; email: string } | null> {
    // En demo, el token ES el email.
    if (!token) return null;
    return { id: `demo-${token}`, email: token };
  }
}

export class FakeNotificacion implements NotificacionPort {
  public enviadas: Array<{ paraEmail: string; titulo: string }> = [];
  public aprobaciones: Array<{ aprobadorEmail: string; liquidacionId: string }> = [];
  async notificar(params: { paraEmail: string; titulo: string; cuerpo: string }): Promise<void> {
    this.enviadas.push({ paraEmail: params.paraEmail, titulo: params.titulo });
  }
  async solicitarAprobacion(params: { aprobadorEmail: string; aprobadorNombre?: string; titulo: string; liquidacionId: string; liquidacionName?: string }): Promise<void> {
    // [DEMO] En produccion aqui se crea el Teams Approval para el aprobador.
    this.aprobaciones.push({ aprobadorEmail: params.aprobadorEmail, liquidacionId: params.liquidacionId });
  }
}
