// =====================================================================
//  Puertos (hexagonal). Todo lo que en Power Platform era "gratis" se
//  expresa como una interfaz. El dominio depende de estas interfaces,
//  no de proveedores concretos. Ver adapters/ para implementaciones.
// =====================================================================
import type { Empresa, MetodoPago, Moneda, SituacionFiscal } from "../domain/types.js";

/** OCR: hoy Azure Document Intelligence. Afuera: Azure/Google/AWS. */
export interface OcrPort {
  /** Devuelve el texto crudo leido de la imagen (donde se busca la clave). */
  leerTexto(imagen: Buffer): Promise<{ texto: string; confianza: number }>;
}

/** Correo entrante para los XML: hoy buzon M365. Afuera: inbound email / IMAP. */
export interface CorreoEntrantePort {
  /** Emite cada correo recibido en el buzon de facturacion. */
  onCorreo(handler: (correo: CorreoEntrante) => Promise<void>): void;
}
export interface CorreoEntrante {
  asunto: string;
  adjuntos: Array<{ nombre: string; contenidoBase64: string; mimeType: string }>;
}

/** Almacenamiento de archivos (fotos, PDFs): hoy Dataverse/Blob. Afuera: S3/R2/Blob. */
export interface StoragePort {
  /** Guarda binario y devuelve la URL. contenido ya debe ser binario (no base64). */
  guardar(params: { contenido: Buffer; ruta: string; mimeType: string }): Promise<string>;
}

/** Identidad: hoy Entra/M365. Afuera: Auth0/Clerk/Supabase Auth. */
export interface UsuarioAutenticado { id: string; email: string; nombre?: string; roles: string[]; }
export interface AuthPort {
  usuarioActual(token: string): Promise<UsuarioAutenticado | null>;
}

/** Notificaciones (aprobaciones/devoluciones): hoy Teams. Afuera: email/otro canal. */
export interface NotificacionPort {
  notificar(params: { paraEmail: string; titulo: string; cuerpo: string }): Promise<void>;
  /** Solicita aprobacion al aprobador seleccionado (hoy: Teams Approval al enviar). */
  solicitarAprobacion(params: { aprobadorEmail: string; aprobadorNombre?: string; titulo: string; liquidacionId: string; liquidacionName?: string; enlace?: string }): Promise<void>;
}

/** Directorio de usuarios/aprobadores. Hoy: Entra (Graph). Demo: sembrados. */
export interface UsuarioDir { id: string; email: string; nombre?: string; personnelNumber?: string; }
export interface UsuariosPort {
  listar(): Promise<UsuarioDir[]>;
}

// ---------------------------------------------------------------------
//  Integracion con D365 FO. La logica NO cambia: sigue siendo el
//  servicio X++ (NTCExpenseReportService.xpp), expuesto como endpoint.
// ---------------------------------------------------------------------
export interface LineaReporteFO {
  costType: string; // categoria exacta, ej. "COMBUSTIBLES"
  amount: number;
  currency: Moneda;
  payMethod: MetodoPago;
  transDate: string; // ISO
  description: string;
  taxGroup: SituacionFiscal; // grupo de venta (IVA/EXENTO/NO SUJETO)
  taxItemGroup: string; // grupo de articulos, ej. "IVA 13%"
  receiptNumber?: string; // numero de factura/comprobante -> TrvExpTrans.ReceiptNumber
  merchant?: string; // comerciante -> TrvExpTrans.MerchantId
  zone?: string; // KILOMETRAJE: GAM/GIRAS -> TrvExpTrans.ZoneCode
  km?: number; // KILOMETRAJE: kilometros -> TrvExpTrans.KMOwnCar
  costCenter?: string; // centro de costo (OMCostCenter) -> DefaultDimension
}

export interface ReporteGastoFO {
  company: Empresa;
  personnelNumber: string; // NTC-xxxx
  purpose: string; // Txt2
  description: string; // Txt1
  externalId: string; // id de la liquidacion (idempotencia / anti-duplicado en FO)
  lineas: LineaReporteFO[];
}

export interface RespuestaFO {
  success: boolean;
  message: string;
  expenseReportNumber?: string;
  headerRecId?: number;
}

export interface FinancePort {
  crearReporteGasto(reporte: ReporteGastoFO): Promise<RespuestaFO>;
}
