const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8080";

// Proveedor de token (lo setea MSAL cuando hay login real). En dev queda null.
let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(fn: (() => Promise<string | null>) | null): void { tokenProvider = fn; }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const tieneBody = init?.body != null;
  const tok = tokenProvider ? await tokenProvider() : null;
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(tieneBody ? { "content-type": "application/json" } : {}),
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) { super(`API ${status}`); }
}

export interface Usuario { id: string; email: string; nombre?: string; personnelNumber?: string }
export interface Categoria { id: string; codigo: string; nombre: string; taxItemGroup: string; empresa: string }
export interface CentroCosto { id: string; operatingUnitNumber: string; name: string }
export interface GrupoImpuesto { id: string; name: string }
export interface Catalogos { categorias: Categoria[]; centrosCosto: CentroCosto[]; gruposImpuesto: GrupoImpuesto[]; usuarios: Usuario[] }

export interface Gasto {
  id: string; name?: string; montoTotal: number; moneda: string; metodoPago: string;
  situacionFiscal: string; litros?: number | null; tipoGasolina?: string | null; zona?: string | null; kilometros?: number | null;
  grupoImpuesto: string; comerciante?: string; numeroFactura?: string | null; centroCostoId?: string | null; facturaId?: string | null;
  excedeLimite?: boolean; alerta?: string | null; informacionAdicional?: string | null;
  fecha?: string; urlPdf?: string | null; tipoComprobante?: string; gastoOrigenId?: string | null;
  adjuntos?: Array<{ nombre: string; url: string; tipo: string }>;
  categoria?: Categoria | null;
  factura?: Factura | null;
}
export interface Liquidacion {
  id: string; name: string; empresa: string; proposito: string; moneda: string;
  estado: string; montoInforme?: number; numeroReporteFO?: string | null;
  correoEmpleado?: string; centroCostoId?: string | null; aprobadorId?: string | null;
  comentarioConta?: string | null; createdAt?: string; updatedAt?: string; gastos?: Gasto[];
}
export interface FacturaSinCruzar { id: string; clave: string; consecutivo?: string; emisorNombre?: string; totalComprobante: number; situacionFiscal: string; detalle?: string; }
export interface Factura {
  id: string; clave: string; consecutivo?: string; emisorNombre?: string; emisorIdentificacion?: string;
  totalComprobante: number; totalImpuesto?: number; totalGravado?: number; totalExento?: number; totalNoSujeto?: number;
  moneda: string; situacionFiscal: string; estado: string; detalle?: string; cantidad?: number;
}

export interface ReglaMonto { id: string; categoriaCodigo: string; montoMaxCRC: number; montoMaxUSD: number; activo: boolean; }

export interface Sesion { id: string; email: string; nombre?: string; roles: string[]; rol: "admin" | "conta" | "estandar"; }

export interface TarifaKm { id: string; zona: string; montoPorKm: number; activo: boolean }

export const api = {
  health: () => req<{ ok: boolean; demo: boolean; auth?: boolean; selfApproval?: boolean }>("/health"),
  me: () => req<Sesion | null>("/me"),
  catalogos: () => req<Catalogos>("/catalogos"),
  crearLiquidacion: (b: Record<string, unknown>) => req<Liquidacion>("/liquidaciones", { method: "POST", body: JSON.stringify(b) }),
  listar: (estado?: string) => req<Liquidacion[]>("/liquidaciones" + (estado ? `?estado=${estado}` : "")),
  detalle: (id: string) => req<Liquidacion>(`/liquidaciones/${id}`),
  ingestarXml: (xml: string) => req<{ status: string; clave?: string; total?: number; situacion?: string }>("/facturas/ingesta-xml", { method: "POST", body: JSON.stringify({ xml }) }),
  crearCaptura: (b: Record<string, unknown>) => req<{ name: string }>("/capturas", { method: "POST", body: JSON.stringify(b) }),
  marcarRegimen: (id: string) => req<{ ok: boolean }>(`/capturas/${id}/marcar-regimen`, { method: "POST" }),
  convertirRegimen: (id: string, b: Record<string, unknown>) => req<{ ok: boolean; gastoId?: string }>(`/capturas/${id}/convertir-regimen`, { method: "POST", body: JSON.stringify(b) }),
  cruce: () => req<{ cruzados: number; sinFactura: number }>("/jobs/cruce", { method: "POST" }),
  ingestaCorreo: () => req<{ procesados: number }>("/jobs/ingesta-correo", { method: "POST" }),
  enviar: (id: string) => req<{ ok: boolean; errores: string[]; aprobadorNotificado?: string; notifError?: string }>(`/liquidaciones/${id}/enviar`, { method: "POST" }),
  aprobar: (id: string, comentario?: string) => req<{ ok: boolean }>(`/liquidaciones/${id}/aprobar`, { method: "POST", body: JSON.stringify({ comentario }) }),
  devolver: (id: string, comentario: string) => req<{ ok: boolean }>(`/liquidaciones/${id}/devolver`, { method: "POST", body: JSON.stringify({ comentario }) }),
  aprobarConta: (id: string) => req<{ ok: boolean; mensaje: string; numeroReporteFO?: string }>(`/liquidaciones/${id}/aprobar-conta`, { method: "POST" }),
  crearGastoManual: (liqId: string, facturaId: string, categoriaId: string) => req<{ ok: boolean }>(`/liquidaciones/${liqId}/gastos`, { method: "POST", body: JSON.stringify({ facturaId, categoriaId }) }),
  crearGastoSimplificado: (liqId: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/liquidaciones/${liqId}/gastos-simplificado`, { method: "POST", body: JSON.stringify(b) }),
  dividirGasto: (gastoId: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/gastos/${gastoId}/dividir`, { method: "POST", body: JSON.stringify(b) }),
  subirAdjunto: (gastoId: string, b: Record<string, unknown>) => req<{ ok: boolean; adjuntos?: Array<{ nombre: string; url: string; tipo: string }> }>(`/gastos/${gastoId}/adjuntos`, { method: "POST", body: JSON.stringify(b) }),
  actualizarGasto: (id: string, patch: Record<string, unknown>) => req<{ gasto: Gasto; errores: string[] }>(`/gastos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  actualizarLiquidacion: (id: string, b: Record<string, unknown>) => req<{ ok: boolean; aprobadorNotificado?: string }>(`/liquidaciones/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  facturasSinCruzar: () => req<FacturaSinCruzar[]>("/facturas/sin-cruzar"),
  facturas: () => req<Factura[]>("/facturas"),
  crearFactura: (b: Record<string, unknown>) => req<{ ok: boolean }>("/facturas", { method: "POST", body: JSON.stringify(b) }),
  actualizarFactura: (id: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/facturas/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  capturas: () => req<Record<string, unknown>[]>("/capturas"),
  gastos: () => req<Record<string, unknown>[]>("/gastos"),
  reglasMonto: () => req<ReglaMonto[]>("/reglas-monto"),
  crearReglaMonto: (b: Record<string, unknown>) => req<{ ok: boolean }>("/reglas-monto", { method: "POST", body: JSON.stringify(b) }),
  actualizarReglaMonto: (id: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/reglas-monto/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  tarifasKm: () => req<TarifaKm[]>("/tarifas-km"),
  actualizarTarifaKm: (id: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/tarifas-km/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  reset: () => req<{ ok: boolean; facturasReseteadas: number }>("/admin/reset", { method: "POST" }),
};

export function fotoDemo(texto: string): string { return btoa(unescape(encodeURIComponent(texto))); }
