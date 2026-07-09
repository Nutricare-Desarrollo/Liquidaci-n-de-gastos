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

export interface FoHttpConfig {
  baseUrl: string; // p.ej. https://miorg.operations.dynamics.com
  servicePath: string; // ruta del custom service que envuelve NTCExpenseReportService
  getAccessToken: () => Promise<string>; // OAuth2 client_credentials (cuenta de servicio)
  fetchImpl?: typeof fetch;
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

    // Payload alineado con el DataContract del X++ (NTCExpenseReportRequestContract).
    // TODO(N-lineas): cuando el servicio X++ acepte una lista, enviar reporte.lineas completo.
    const primera = reporte.lineas[0]!;
    const body = {
      _request: {
        Company: company,
        PersonnelNumber: reporte.personnelNumber,
        Purpose: reporte.purpose,
        Description: reporte.description,
        CostType: primera.costType,
        Amount: primera.amount,
        Currency: primera.currency,
        PayMethod: primera.payMethod,
        TransDate: primera.transDate,
        TaxGroup: primera.taxGroup,
      },
    };

    const res = await doFetch(`${this.cfg.baseUrl}${this.cfg.servicePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { success: false, message: `FO respondio ${res.status}: ${detalle}` };
    }

    // El servicio X++ devuelve NTCExpenseReportResponseContract.
    const data = (await res.json()) as {
      Success?: boolean;
      Message?: string;
      ExpenseReportNumber?: string;
      HeaderRecId?: number;
    };

    return {
      success: !!data.Success,
      message: data.Message ?? "",
      expenseReportNumber: data.ExpenseReportNumber,
      headerRecId: data.HeaderRecId,
    };
  }
}
