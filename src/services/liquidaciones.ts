// =====================================================================
//  Servicio de liquidaciones: flujo de estados y edicion de gastos.
//  Aprobacion en DOS etapas con orden forzado (aprobador, luego conta).
// =====================================================================
import type { Db } from "../db/client.js";
import type { FinancePort, StoragePort, UsuariosPort } from "../ports/index.js";
import { validarEnvioInforme, validarGasto } from "../domain/validaciones.js";
import { postearInforme } from "./posteoFO.js";
import { cargarInforme, marcarPosteado } from "../db/posteoRepo.js";
import { crearGastoDesdeFactura } from "./procesarCruce.js";
import type { TipoGasolina } from "../domain/types.js";

type Rec = Record<string, unknown>;
const CEDULA = "3101179050";

// Divisiones y regimen simplificado no exigen datos de combustible.
function omitirComb(g: Rec): boolean {
  return !!g["gastoOrigenId"] || g["tipoComprobante"] === "REGIMEN_SIMPLIFICADO";
}

async function recalcularMonto(db: Db, liquidacionId: string): Promise<void> {
  const gastos = (await db.gasto.findMany({ where: { liquidacionId } })) as Rec[];
  const total = gastos.reduce((s, g) => s + Number(g["montoTotal"] ?? 0), 0);
  await db.liquidacion.update({ where: { id: liquidacionId }, data: { montoInforme: total } });
}

export async function crearLiquidacion(db: Db, data: {
  empleadoId: string; correoEmpleado: string; empresa: string; proposito: string;
  moneda: string; centroCostoId?: string | null; aprobadorId?: string | null;
}): Promise<Rec> {
  const n = (await db.liquidacion.count()) + 1;
  return db.liquidacion.create({
    data: {
      name: `LIQ-${String(n).padStart(4, "0")}`,
      empleadoId: data.empleadoId, correoEmpleado: data.correoEmpleado,
      empresa: data.empresa, proposito: data.proposito, moneda: data.moneda,
      centroCostoId: data.centroCostoId ?? null, aprobadorId: data.aprobadorId ?? null, estado: "BORRADOR",
    },
  });
}

export async function listarLiquidaciones(db: Db, estado?: string, ownerId?: string): Promise<Rec[]> {
  const where: Record<string, unknown> = {};
  if (estado) where["estado"] = estado;
  if (ownerId) where["empleadoId"] = ownerId;
  return db.liquidacion.findMany(Object.keys(where).length ? { where } : undefined) as Promise<Rec[]>;
}

export async function obtenerConGastos(db: Db, id: string): Promise<Rec | null> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return null;
  const gastos = (await db.gasto.findMany({ where: { liquidacionId: id }, include: { categoria: true, factura: true } })) as Rec[];
  return { ...liq, gastos };
}

export async function actualizarGasto(db: Db, id: string, patch: {
  centroCostoId?: string | null; grupoImpuesto?: string; informacionAdicional?: string;
  litros?: number | null; tipoGasolina?: string | null; categoriaId?: string; numeroFactura?: string;
  zona?: string | null; kilometros?: number | null;
}): Promise<{ gasto: Rec; errores: string[] }> {
  await db.gasto.update({ where: { id }, data: patch as Rec });
  // Re-leer con la categoria incluida para validar con el codigo correcto.
  const gasto = (await db.gasto.findFirst({ where: { id }, include: { categoria: true } })) as Rec;
  const errores = validarGasto({
    categoriaCodigo: String((gasto["categoria"] as Rec | undefined)?.["codigo"] ?? gasto["categoriaCodigo"] ?? ""),
    litros: gasto["litros"] as number | null, tipoGasolina: gasto["tipoGasolina"] as TipoGasolina | null,
    excedeLimite: Boolean(gasto["excedeLimite"]), informacionAdicional: gasto["informacionAdicional"] as string | null,
    omitirCombustible: omitirComb(gasto),
  });
  return { gasto, errores };
}

export async function crearGastoManual(db: Db, liquidacionId: string, facturaId: string, categoriaId: string):
  Promise<{ ok: boolean; error?: string }> {
  const factura = (await db.factura.findUnique({ where: { id: facturaId } })) as Rec | null;
  if (!factura) return { ok: false, error: "La factura no existe." };
  if (factura["estado"] === "CRUZADA") return { ok: false, error: "Esa factura ya fue cruzada." };
  if (factura["receptorIdentificacion"] !== CEDULA) return { ok: false, error: "La factura no es a nombre de Nutricare." };
  const ok = await crearGastoDesdeFactura(db, { liquidacionId, factura, categoriaId });
  return ok ? { ok: true } : { ok: false, error: "Faltan datos (liquidación o categoría)." };
}

export async function enviarInforme(db: Db, id: string): Promise<{ ok: boolean; errores: string[] }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, errores: ["No existe la liquidacion."] };
  if (!["BORRADOR", "DEVUELTA"].includes(String(liq["estado"])))
    return { ok: false, errores: [`No se puede enviar desde el estado ${liq["estado"]}.`] };
  const errores = validarEnvioInforme({ aprobadorId: liq["aprobadorId"] as string | null });
  const gastos = (await db.gasto.findMany({ where: { liquidacionId: id }, include: { categoria: true } })) as Rec[];
  if (gastos.length === 0) errores.push("El informe no tiene gastos.");
  for (const g of gastos) {
    errores.push(...validarGasto({
      categoriaCodigo: String((g["categoria"] as Rec | undefined)?.["codigo"] ?? ""),
      litros: g["litros"] as number | null, tipoGasolina: g["tipoGasolina"] as TipoGasolina | null,
      excedeLimite: Boolean(g["excedeLimite"]), informacionAdicional: g["informacionAdicional"] as string | null,
      omitirCombustible: omitirComb(g),
    }));
  }
  if (errores.length) return { ok: false, errores };
  await recalcularMonto(db, id);
  await db.liquidacion.update({ where: { id }, data: { estado: "ENVIADA" } });
  return { ok: true, errores: [] };
}

export async function actualizarCentroCosto(db: Db, id: string, centroCostoId: string | null): Promise<{ ok: boolean; error?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, error: "No existe la liquidacion." };
  if (!["BORRADOR", "DEVUELTA", "ENVIADA"].includes(String(liq["estado"])))
    return { ok: false, error: `No se puede editar el centro de costo en el estado ${liq["estado"]}.` };
  await db.liquidacion.update({ where: { id }, data: { centroCostoId: centroCostoId || null } });
  // Propagar a los gastos (la dimension financiera de FO sale del centro de costo del gasto).
  const gastos = (await db.gasto.findMany({ where: { liquidacionId: id } })) as Rec[];
  for (const g of gastos) await db.gasto.update({ where: { id: String(g["id"]) }, data: { centroCostoId: centroCostoId || null } });
  return { ok: true };
}

export async function actualizarAprobador(db: Db, id: string, aprobadorId: string | null, permitirAutoaprobacion = false): Promise<{ ok: boolean; error?: string; estado?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, error: "No existe la liquidacion." };
  const estado = String(liq["estado"]);
  if (!["BORRADOR", "DEVUELTA", "ENVIADA"].includes(estado))
    return { ok: false, error: `No se puede cambiar el aprobador en el estado ${estado}.` };
  if (!aprobadorId) return { ok: false, error: "Selecciona un aprobador." };
  if (!permitirAutoaprobacion && aprobadorId === String(liq["empleadoId"] ?? "")) return { ok: false, error: "El aprobador no puede ser el mismo solicitante." };
  await db.liquidacion.update({ where: { id }, data: { aprobadorId } });
  return { ok: true, estado };
}

export async function aprobarAprobador(db: Db, id: string, comentario?: string): Promise<{ ok: boolean; error?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, error: "No existe la liquidacion." };
  if (liq["estado"] !== "ENVIADA")
    return { ok: false, error: `El aprobador solo puede aprobar informes ENVIADOS (estado actual: ${liq["estado"]}).` };
  await db.liquidacion.update({ where: { id }, data: { estado: "EN_REVISION_CONTA", comentarioAprobacion: comentario ?? null } });
  return { ok: true };
}

export async function devolver(db: Db, id: string, comentario: string): Promise<{ ok: boolean; error?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, error: "No existe la liquidacion." };
  if (!["ENVIADA", "EN_REVISION_CONTA"].includes(String(liq["estado"])))
    return { ok: false, error: `No se puede devolver desde el estado ${liq["estado"]}.` };
  await db.liquidacion.update({ where: { id }, data: { estado: "DEVUELTA", comentarioConta: comentario } });
  return { ok: true };
}

export async function aprobarConta(db: Db, id: string, finance: FinancePort, usuarios?: UsuariosPort):
  Promise<{ ok: boolean; mensaje: string; numeroReporteFO?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, mensaje: "No existe la liquidacion." };
  if (!["EN_REVISION_CONTA", "ERROR_POSTEO", "APROBADA"].includes(String(liq["estado"])))
    return { ok: false, mensaje: `Conta solo aprueba/reintenta informes EN REVISION, APROBADA (posteo pendiente) o con ERROR DE POSTEO (estado actual: ${liq["estado"]}).` };
  await db.liquidacion.update({ where: { id }, data: { estado: "APROBADA" } });
  const informe = await cargarInforme(db, id, usuarios);
  if (!informe) return { ok: false, mensaje: "No existe la liquidacion." };
  const r = await postearInforme(informe, finance);
  if (r.posteado && r.numeroReporteFO) {
    await marcarPosteado(db, id, r.numeroReporteFO);
    return { ok: true, mensaje: r.mensaje, numeroReporteFO: r.numeroReporteFO };
  }
  if (r.yaEstaba) return { ok: true, mensaje: r.mensaje, numeroReporteFO: r.numeroReporteFO };
  await db.liquidacion.update({ where: { id }, data: { estado: "ERROR_POSTEO" } });
  return { ok: false, mensaje: r.mensaje };
}

export async function colas(db: Db): Promise<{ facturasSinCaptura: Rec[]; capturasSinFactura: Rec[] }> {
  const facturasSinCaptura = (await db.factura.findMany({ where: { estado: "SIN_CAPTURA", esDeLaEmpresa: true } })) as Rec[];
  const capturasSinFactura = (await db.captura.findMany({ where: { estado: "PENDIENTE_CRUCE", facturaId: null } })) as Rec[];
  return { facturasSinCaptura, capturasSinFactura };
}

export async function facturasSinCruzar(db: Db): Promise<Rec[]> {
  return db.factura.findMany({ where: { estado: "SIN_CAPTURA", esDeLaEmpresa: true } }) as Promise<Rec[]>;
}

// Reinicio de datos de PRUEBA: borra liquidaciones/gastos/capturas y deja las
// facturas otra vez "sin cruzar". Pensado para demos repetibles (no produccion).
export async function reiniciarDatosPrueba(db: Db): Promise<{ ok: boolean; facturasReseteadas: number }> {
  await db.gasto.deleteMany({});
  await db.captura.deleteMany({});
  await db.liquidacion.deleteMany({});
  const facturas = (await db.factura.findMany({ where: { estado: "CRUZADA" } })) as Rec[];
  for (const f of facturas) {
    await db.factura.update({ where: { id: String(f["id"]) }, data: { estado: "SIN_CAPTURA" } });
  }
  return { ok: true, facturasReseteadas: facturas.length };
}

// Adjuntar documento al ENCABEZADO de la liquidacion (Contabilidad).
export async function subirAdjuntoLiquidacion(db: Db, storage: StoragePort, id: string, a: {
  nombre: string; contenidoBase64: string; mimeType: string;
}): Promise<{ ok: boolean; error?: string; adjuntos?: Array<{ nombre: string; url: string; tipo: string }> }> {
  const l = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!l) return { ok: false, error: "No existe la liquidacion." };
  const url = await storage.guardar({
    contenido: Buffer.from(a.contenidoBase64, "base64"),
    ruta: `liquidaciones/${id}/${Date.now()}-${a.nombre}`,
    mimeType: a.mimeType,
  });
  const adjuntos = Array.isArray(l["adjuntos"]) ? (l["adjuntos"] as Array<{ nombre: string; url: string; tipo: string }>) : [];
  adjuntos.push({ nombre: a.nombre, url, tipo: a.mimeType });
  await db.liquidacion.update({ where: { id }, data: { adjuntos } });
  return { ok: true, adjuntos };
}
