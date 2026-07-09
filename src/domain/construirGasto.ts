// =====================================================================
//  Construccion del gasto al cruzar (traspaso 4.3 y siguientes).
//  Funcion pura: dada la factura, la liquidacion y la categoria, arma el
//  gasto heredando/calculando todo. IMPORTANTE: el gasto lleva la MONEDA
//  DEL INFORME (regla de negocio: un informe = una sola moneda).
// =====================================================================
import type {
  Categoria, FacturaParseada, MetodoPago, Moneda, Proposito, ReglaMonto, SituacionFiscal, TipoGasolina,
} from "./types.js";
import { metodoPago } from "./metodoPago.js";
import { CATEGORIA_COMBUSTIBLE, detectarCombustible } from "./combustible.js";
import { evaluarLimite } from "./reglasMonto.js";
import { resolverGrupoImpuesto } from "./grupoImpuesto.js";
import { validarGasto } from "./validaciones.js";

export interface DatosLiquidacion {
  proposito: Proposito;
  moneda: Moneda;
  centroCostoId: string | null;
}

export interface GastoConstruido {
  montoTotal: number;
  moneda: Moneda;
  fecha: string;
  categoriaCodigo: string;
  comerciante: string;
  centroCostoId: string | null;
  metodoPago: MetodoPago;
  situacionFiscal: SituacionFiscal;
  grupoImpuesto: string;
  grupoImpuestoExisteEnCatalogo: boolean;
  litros: number | null;
  tipoGasolina: TipoGasolina | null;
  excedeLimite: boolean;
  alerta: string;
  urlPdf: string | null;
  errores: string[];
}

export function construirGasto(params: {
  factura: FacturaParseada & { urlPdf?: string | null };
  liquidacion: DatosLiquidacion;
  categoria: Categoria;
  gruposImpuestoDisponibles: string[];
  reglas: ReglaMonto[];
}): GastoConstruido {
  const { factura, liquidacion, categoria } = params;
  const esCombustible = categoria.codigo === CATEGORIA_COMBUSTIBLE;

  const combustible = esCombustible
    ? detectarCombustible(factura.cantidad, factura.detalle)
    : { litros: null as number | null, tipo: null as TipoGasolina | null };

  const grupo = resolverGrupoImpuesto({
    taxItemGroupCategoria: categoria.taxItemGroup,
    gruposDisponibles: params.gruposImpuestoDisponibles,
  });

  const limite = evaluarLimite({
    categoriaCodigo: categoria.codigo,
    monto: factura.totalComprobante,
    monedaInforme: liquidacion.moneda,
    reglas: params.reglas,
  });

  const errores = validarGasto({
    categoriaCodigo: categoria.codigo,
    litros: combustible.litros,
    tipoGasolina: combustible.tipo,
    excedeLimite: limite.excede,
    informacionAdicional: null,
  });

  return {
    montoTotal: factura.totalComprobante,
    moneda: liquidacion.moneda, // moneda del INFORME (no la de la factura)
    fecha: factura.fechaEmision,
    categoriaCodigo: categoria.codigo,
    comerciante: factura.emisorNombre,
    centroCostoId: liquidacion.centroCostoId,
    metodoPago: metodoPago(liquidacion.proposito, liquidacion.moneda),
    situacionFiscal: factura.situacionFiscal,
    grupoImpuesto: grupo.grupo,
    grupoImpuestoExisteEnCatalogo: grupo.existeEnCatalogo,
    litros: combustible.litros,
    tipoGasolina: combustible.tipo,
    excedeLimite: limite.excede,
    alerta: limite.alerta,
    urlPdf: factura.urlPdf ?? null,
    errores,
  };
}
