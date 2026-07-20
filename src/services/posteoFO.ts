// =====================================================================
//  Servicio: posteo del informe a D365 FO (traspaso 5 y 8, pendientes).
//  - Se dispara al aprobar contabilidad.
//  - Blindaje ANTI-DUPLICADO: no postear si el informe ya tiene numero FO.
//  - Arma cabecera + N lineas (una por gasto) y llama al FinancePort.
// =====================================================================
import type { FinancePort, LineaReporteFO, ReporteGastoFO } from "../ports/index.js";
import type { Empresa, MetodoPago, Moneda, SituacionFiscal } from "../domain/types.js";

export interface InformeParaPostear {
  id: string;
  numeroReporteFO: string | null; // si ya tiene -> ya se posteo
  empresa: Empresa;
  personnelNumber: string; // NTC-xxxx
  purpose: string;
  descripcion: string;
  gastos: Array<{
    costType: string;
    amount: number;
    currency: Moneda;
    payMethod: MetodoPago;
    transDate: string;
    description: string;
    taxGroup: SituacionFiscal;
    taxItemGroup: string;
    receiptNumber?: string;
    merchant?: string;
    zone?: string;
    km?: number;
  }>;
}

export interface ResultadoPosteo {
  posteado: boolean;
  yaEstaba: boolean;
  numeroReporteFO?: string;
  mensaje: string;
}

export async function postearInforme(
  informe: InformeParaPostear,
  finance: FinancePort,
): Promise<ResultadoPosteo> {
  // Anti-duplicado.
  if (informe.numeroReporteFO) {
    return {
      posteado: false,
      yaEstaba: true,
      numeroReporteFO: informe.numeroReporteFO,
      mensaje: `El informe ${informe.id} ya tiene numero FO ${informe.numeroReporteFO}.`,
    };
  }

  if (informe.gastos.length === 0) {
    return { posteado: false, yaEstaba: false, mensaje: "El informe no tiene gastos." };
  }

  const lineas: LineaReporteFO[] = informe.gastos.map((g) => ({
    costType: g.costType,
    amount: g.amount,
    currency: g.currency,
    payMethod: g.payMethod,
    transDate: g.transDate,
    description: g.description,
    taxGroup: g.taxGroup,
    taxItemGroup: g.taxItemGroup,
    receiptNumber: g.receiptNumber,
    merchant: g.merchant,
    zone: g.zone,
    km: g.km,
  }));

  const reporte: ReporteGastoFO = {
    company: informe.empresa,
    personnelNumber: informe.personnelNumber,
    purpose: informe.purpose,
    description: informe.descripcion,
    externalId: informe.id,
    lineas,
  };

  const resp = await finance.crearReporteGasto(reporte);
  return {
    posteado: resp.success,
    yaEstaba: false,
    numeroReporteFO: resp.expenseReportNumber,
    mensaje: resp.message,
  };
}
