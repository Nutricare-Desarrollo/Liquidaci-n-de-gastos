// =====================================================================
//  Adapter de referencia hacia D365 FO.
//  Llama al servicio X++ existente (NTCExpenseReportService) expuesto
//  como custom service / OData. NO reimplementa la logica de FO: la
//  integracion X++ se reutiliza tal cual (traspaso seccion 5).
//
//  Autenticacion: OAuth2 client_credentials contra Entra, con una
//  CUENTA DE SERVICIO DEDICADA (no la cuenta de desarrollo -> deuda tecnica).
//
//  NOTA IMPORTANTE: el servicio X++ actual crea "1 cabecera + 1 linea".
//  El pendiente del traspaso es evolucionarlo a "1 cabecera + N lineas"
//  en una sola llamada atomica. Mientras tanto, este adapter degrada a
//  postear la PRIMERA linea y avisa. Cuando el X++ soporte N lineas,
//  solo cambia el payload; la interfaz FinancePort no cambia.
// =====================================================================
import type { FinancePort, ReporteGastoFO, RespuestaFO } from "../../ports/index.js";

/** FO (FormJsonSerializer) espera fechas como "/Date(ms)/", no ISO. */
function foDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : `/Date(${ms})/`;
}

export interface FoHttpConfig {
  baseUrl: string; // p.ej. https://miorg.operations.dynamics.com
  servicePath: string; // ruta del custom service que envuelve NTCExpenseReportService
  getAccessToken: () => Promise<string>; // OAuth2 client_credentials (cuenta de servicio)
  fetchImpl?: typeof fetch;
  timeoutMs?: number; // corta la llamada si FO no responde (default 120s)
}

export class FoHttpClient implements FinancePort {
  constructor(private readonly cfg: FoHttpConfig) {}

  async crearReporteGasto(reporte: ReporteGastoFO): Promise<RespuestaFO> {
    if (reporte.lineas.length === 0) {
      return { success: false, message: "El reporte no tiene lineas." };
    }

    const doFetch = this.cfg.fetchImpl ?? fetch;
    const token = await this.cfg.getAccessToken();

    // Empresa en MAYUSCULA (changecompany falla con vacio/minuscula segun el caso).
    const company = reporte.company.toUpperCase();

    // Payload alineado con el DataContract del X++ (NTCExpenseReportRequestContract):
    // 1 cabecera + N lineas + ExternalId (idempotencia / anti-duplicado en FO).
    const requestObj = {
      Company: company,
      PersonnelNumber: reporte.personnelNumber,
      Purpose: reporte.purpose,
      Description: reporte.description,
      ExternalId: reporte.externalId,
      Lines: reporte.lineas.map((l) => ({
        CostType: l.costType,
        Amount: l.amount,
        Currency: l.currency,
        PayMethod: l.payMethod,
        TransDate: foDate(l.transDate),
        Description: l.description,
        TaxGroup: l.taxGroup,
        TaxItemGroup: l.taxItemGroup,
        ReceiptNumber: l.receiptNumber ?? "",
        MerchantId: l.merchant ?? "",
        ZoneCode: l.zone ?? "",
        KMOwnCar: l.km ?? 0,
        CostCenter: l.costCenter ?? "",
      })),
    };
    // El servicio X++ recibe el request como string JSON (evita el bug de List<JObject>).
    const body = { _requestJson: JSON.stringify(requestObj) };

    const timeoutMs = this.cfg.timeoutMs ?? 120_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Awaited<ReturnType<typeof doFetch>>;
    try {
      res = await doFetch(`${this.cfg.baseUrl}${this.cfg.servicePath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      const msg = (e as Error).name === "AbortError"
        ? `FO no respondio dentro de ${timeoutMs / 1000}s (timeout).`
        : `No se pudo contactar a FO: ${(e as Error).message}`;
      return { success: false, message: msg };
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text().catch(() => "");
    // Log del cuerpo crudo para diagnosticar (siempre, mientras validamos FO).
    console.log(`[FO] status=${res.status} body=${raw.slice(0, 1500)}`);

    if (!res.ok) {
      return { success: false, message: `FO respondio ${res.status}: ${raw.slice(0, 500)}` };
    }

    // El servicio X++ devuelve NTCExpenseReportResponseContract.
    let data: { Success?: boolean; Message?: string; ExpenseReportNumber?: string; HeaderRecId?: number } = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { /* respuesta no-JSON: data queda vacio */ }

    // Solo consideramos exito si FO confirma Success Y devuelve numero de reporte.
    const numero = data.ExpenseReportNumber;
    if (!data.Success || !numero) {
      return { success: false, message: data.Message || `Respuesta inesperada de FO: ${raw.slice(0, 500)}` };
    }

    return {
      success: true,
      message: data.Message ?? "",
      expenseReportNumber: numero,
      headerRecId: data.HeaderRecId,
    };
  }
}
