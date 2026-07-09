// =====================================================================
//  Tipos del dominio. Fuente: documento de traspaso Nutricare.
//  Principio clave: el XML es la fuente de verdad financiera.
//  La foto solo aporta identidad del empleado y la llave de cruce.
// =====================================================================

/** Empresas en FO (en minuscula para el servicio X++). */
export type Empresa = "ntc" | "feh";

/** Cedula juridica de Nutricare (receptor valido en el XML). */
export const CEDULA_NUTRICARE = "3101179050";

export type Moneda = "CRC" | "USD" | "Otra";

/** Situacion fiscal derivada del XML. Coincide con los SalesTaxGroup de FO. */
export type SituacionFiscal = "IVA" | "EXENTO" | "NO SUJETO" | "";

/** Proposito del informe. Controla el metodo de pago. */
export type Proposito =
  | "CAJA CHICA"
  | "PAGO CON FONDOS PERSONALES"
  | "TARJETA CORPORATIVA";

/** Metodo de pago calculado (valores exactos que espera FO). */
export type MetodoPago = "CAJA CHICA" | "FONDOS_PERS" | "TARJET_COR" | "TARJET_DOL";

/** Tipo de gasolina (choice de FO). */
export enum TipoGasolina {
  Gasolina = 1,
  Diesel = 2,
  GasLP = 3,
}

export type TipoComprobante = "Factura electronica" | "Regimen simplificado";

/** Estados del informe (liquidacion). */
export type EstadoLiquidacion =
  | "Borrador"
  | "Enviada"
  | "En revision de conta"
  | "Aprobada"
  | "Posteada"
  | "Devuelta"
  | "Error de posteo";

export type EstadoCaptura = "Pendiente de OCR" | "Pendiente de cruce" | "Cruzada";
export type EstadoFactura = "Sin captura" | "Cruzada";
export type EstadoGasto = "Asignado";

/**
 * Resultado del parseo de una factura electronica de Hacienda.
 * Todos los montos ya vienen forzados a numero.
 */
export interface FacturaParseada {
  clave: string;
  consecutivo: string;
  fechaEmision: string; // ISO
  emisorNombre: string; // = comerciante
  emisorIdentificacion: string;
  receptorIdentificacion: string;
  totalComprobante: number;
  totalImpuesto: number;
  totalGravado: number;
  totalExento: number;
  totalNoSujeto: number;
  moneda: Moneda;
  situacionFiscal: SituacionFiscal;
  /** Primera linea de detalle (regla: combustible trae una sola linea). */
  cantidad: number; // = litros en combustible
  detalle: string;
}

/** Categoria del catalogo (cargada desde ExpenseCategories de FO). */
export interface Categoria {
  codigo: string; // ExpenseCategory de FO, ej. "COMBUSTIBLES"
  nombre: string;
  taxItemGroup: string; // ej. "IVA 13%"
  expenseType: string; // Meals / Transport / Hotel / CarRental / Expense
  cuentaContable?: string;
  empresa: Empresa;
  activo: boolean;
}

/** Regla de monto (solo Desayuno / Almuerzo / Cena). */
export interface ReglaMonto {
  categoriaCodigo: string;
  montoMaxCRC: number;
  montoMaxUSD: number;
  activo: boolean;
}
