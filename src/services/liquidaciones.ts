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
import type { Empresa, TipoGasolina } from "../domain/types.js";

type Rec = Record<string, unknown>;
const CEDULA = "3101179050";

// Divisiones y regimen simplificado no exigen datos de combustible.
function omitirComb(g: Rec): boolean {
  return !!g["gastoOrigenId"] || g["tipoComprobante"] === "REGIMEN_SIMPLIFICADO";
}

// El gasto tiene adjunto si trae imagenes/PDF propios, una captura (foto),
// o la factura asociada tiene documentos/PDF.
function tieneAdjunto(g: Rec): boolean {
  const adj = g["adjuntos"];
  if (Array.isArray(adj) && adj.length > 0) return true;
  if (g["urlPdf"]) return true;
  if (g["capturaId"]) return true;
  const f = g["factura"] as Rec | null | undefined;
  if (f) {
    const fadj = f["adjuntos"];
    if (Array.isArray(fadj) && fadj.length > 0) return true;
    if (f["urlPdf"]) return true;
  }
  return false;
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

// Clonar una liquidacion + sus gastos (item 5). Solo informacion: NO copia
// adjuntos, PDF, factura cruzada ni captura. La copia nace en BORRADOR.
export async function clonarLiquidacion(db: Db, id: string): Promise<{ ok: boolean; error?: string; id?: string; name?: string }> {
  const orig = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!orig) return { ok: false, error: "No existe la liquidacion." };
  const n = (await db.liquidacion.count()) + 1;
  const nueva = (await db.liquidacion.create({
    data: {
      name: `LIQ-${String(n).padStart(4, "0")}`,
      empleadoId: String(orig["empleadoId"]), correoEmpleado: String(orig["correoEmpleado"] ?? ""),
      empresa: orig["empresa"], proposito: orig["proposito"], moneda: orig["moneda"],
      centroCostoId: (orig["centroCostoId"] as string | null) ?? null,
      aprobadorId: (orig["aprobadorId"] as string | null) ?? null, estado: "BORRADOR",
    },
  })) as Rec;
  const gastos = (await db.gasto.findMany({ where: { liquidacionId: id, gastoOrigenId: null } })) as Rec[];
  for (const g of gastos) {
    await db.gasto.create({
      data: {
        name: `GAS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        liquidacionId: String(nueva["id"]),
        facturaId: null, capturaId: null, // clon = solo info, sin factura/captura ni adjuntos
        montoTotal: g["montoTotal"], moneda: g["moneda"], fecha: g["fecha"],
        categoriaId: String(g["categoriaId"]), comerciante: (g["comerciante"] as string | null) ?? null,
        numeroFactura: (g["numeroFactura"] as string | null) ?? null,
        origen: (g["origen"] as string | null) ?? "MANUAL",
        centroCostoId: (g["centroCostoId"] as string | null) ?? null,
        metodoPago: String(g["metodoPago"] ?? ""), situacionFiscal: g["situacionFiscal"],
        grupoImpuesto: String(g["grupoImpuesto"] ?? ""), tipoComprobante: g["tipoComprobante"],
        litros: (g["litros"] as number | null) ?? null, tipoGasolina: (g["tipoGasolina"] as string | null) ?? null,
        zona: (g["zona"] as string | null) ?? null, kilometros: (g["kilometros"] as number | null) ?? null,
        excedeLimite: Boolean(g["excedeLimite"]), informacionAdicional: (g["informacionAdicional"] as string | null) ?? null,
        urlPdf: null,
      },
    });
  }
  await recalcularMonto(db, String(nueva["id"]));
  return { ok: true, id: String(nueva["id"]), name: String(nueva["name"]) };
}

// Item 8: desligar un gasto de su liquidacion -> queda LIBRE para reasignar.
export async function desligarGasto(db: Db, id: string): Promise<{ ok: boolean; error?: string }> {
  const g = (await db.gasto.findUnique({ where: { id } })) as Rec | null;
  if (!g) return { ok: false, error: "El gasto no existe." };
  const liqId = g["liquidacionId"] as string | null;
  await db.gasto.update({ where: { id }, data: { liquidacionId: null, estadoGasto: "LIBRE" } });
  if (liqId) await recalcularMonto(db, liqId);
  return { ok: true };
}

// Item 8: asociar un gasto LIBRE a una liquidacion.
export async function asociarGasto(db: Db, id: string, liquidacionId: string): Promise<{ ok: boolean; error?: string }> {
  const g = (await db.gasto.findUnique({ where: { id } })) as Rec | null;
  if (!g) return { ok: false, error: "El gasto no existe." };
  const liq = (await db.liquidacion.findUnique({ where: { id: liquidacionId } })) as Rec | null;
  if (!liq) return { ok: false, error: "No existe la liquidacion destino." };
  if (String(g["moneda"]) !== String(liq["moneda"]))
    return { ok: false, error: `La moneda del gasto (${g["moneda"]}) no coincide con la del informe (${liq["moneda"]}).` };
  const liqAnterior = g["liquidacionId"] as string | null;
  await db.gasto.update({ where: { id }, data: { liquidacionId, estadoGasto: "ASOCIADO" } });
  await recalcularMonto(db, liquidacionId);
  if (liqAnterior && liqAnterior !== liquidacionId) await recalcularMonto(db, liqAnterior);
  return { ok: true };
}

export async function listarGastosLibres(db: Db): Promise<Rec[]> {
  return db.gasto.findMany({ where: { estadoGasto: "LIBRE" }, include: { categoria: true } }) as Promise<Rec[]>;
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
  zona?: string | null; kilometros?: number | null; montoTotal?: number;
}): Promise<{ gasto: Rec; errores: string[] }> {
  const data: Rec = { ...patch };
  if (patch.montoTotal !== undefined) data["montoTotal"] = Number(patch.montoTotal); // permitir editar el monto (items 4/9)
  await db.gasto.update({ where: { id }, data });
  // Re-leer con la categoria incluida para validar con el codigo correcto.
  const gasto = (await db.gasto.findFirst({ where: { id }, include: { categoria: true } })) as Rec;
  // Si cambio el monto, recalcular el total del informe.
  if (patch.montoTotal !== undefined) await recalcularMonto(db, String(gasto["liquidacionId"]));
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
  const gastos = (await db.gasto.findMany({ where: { liquidacionId: id }, include: { categoria: true, factura: true } })) as Rec[];
  if (gastos.length === 0) errores.push("El informe no tiene gastos.");
  const proposito = liq["proposito"] as string | null;
  for (const g of gastos) {
    errores.push(...validarGasto({
      categoriaCodigo: String((g["categoria"] as Rec | undefined)?.["codigo"] ?? ""),
      litros: g["litros"] as number | null, tipoGasolina: g["tipoGasolina"] as TipoGasolina | null,
      excedeLimite: Boolean(g["excedeLimite"]), informacionAdicional: g["informacionAdicional"] as string | null,
      omitirCombustible: omitirComb(g),
      exigirObligatorios: true,
      proposito,
      numeroFactura: g["numeroFactura"] as string | null,
      tieneAdjunto: tieneAdjunto(g),
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

// Item 12: re-postear la MISMA liquidacion generando un informe NUEVO en FO
// (nuevo ExternalId por version) y RECHAZANDO el anterior, para que no queden
// dos aprobados. Se postea primero el nuevo; si falla, el anterior queda intacto.
export async function repostearInforme(db: Db, id: string, finance: FinancePort, usuarios?: UsuariosPort):
  Promise<{ ok: boolean; mensaje: string; numeroReporteFO?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, mensaje: "No existe la liquidacion." };
  if (String(liq["estado"]) !== "POSTEADA")
    return { ok: false, mensaje: `Solo se re-postea una liquidacion ya POSTEADA (estado actual: ${liq["estado"]}).` };

  const version = Number(liq["versionFO"] ?? 1);
  const reporteAnterior = (liq["numeroReporteFO"] as string | null) ?? null;
  const externalIdAnterior = version <= 1 ? id : `${id}#v${version}`;
  const nuevaVersion = version + 1;
  const nuevoExternalId = `${id}#v${nuevaVersion}`;

  const informe = await cargarInforme(db, id, usuarios);
  if (!informe) return { ok: false, mensaje: "No existe la liquidacion." };
  informe.numeroReporteFO = null;       // forzar el posteo (saltar anti-dup local)
  informe.externalId = nuevoExternalId; // informe NUEVO en FO

  // 1) Crear el nuevo informe primero. Si falla, el anterior sigue vigente.
  const r = await postearInforme(informe, finance);
  if (!(r.posteado && r.numeroReporteFO))
    return { ok: false, mensaje: `No se pudo crear el nuevo informe en FO: ${r.mensaje}` };

  // 2) Rechazar el informe anterior en FO (que no quede aprobado junto al nuevo).
  const rej = await finance.rechazarReporteGasto({
    company: String(liq["empresa"]) as Empresa,
    externalId: externalIdAnterior,
    expenseReportNumber: reporteAnterior ?? undefined,
  });
  const notaRechazo = rej.success
    ? `el anterior (${reporteAnterior ?? "-"}) fue rechazado en FO`
    : `ATENCION: no se pudo rechazar el anterior (${reporteAnterior ?? "-"}) en FO: ${rej.message} — revisar a mano`;

  await db.liquidacion.update({
    where: { id },
    data: {
      numeroReporteFO: r.numeroReporteFO, versionFO: nuevaVersion, estado: "POSTEADA",
      comentarioConta: `Re-posteo v${nuevaVersion}: nuevo reporte ${r.numeroReporteFO}; ${notaRechazo}.`,
    },
  });
  return { ok: rej.success, mensaje: `Nuevo informe FO ${r.numeroReporteFO}; ${notaRechazo}.`, numeroReporteFO: r.numeroReporteFO };
}

// Reconciliacion manual (item 13): si el posteo dio timeout pero el informe SI se
// creo en FO, conta carga a mano el numero de reporte y se marca POSTEADA.
export async function reconciliarPosteo(db: Db, id: string, numeroReporteFO: string):
  Promise<{ ok: boolean; mensaje: string; numeroReporteFO?: string }> {
  const num = (numeroReporteFO ?? "").trim();
  if (!num) return { ok: false, mensaje: "Ingresa el numero de reporte de FO." };
  const liq = (await db.liquidacion.findUnique({ where: { id } })) as Rec | null;
  if (!liq) return { ok: false, mensaje: "No existe la liquidacion." };
  if (!["ERROR_POSTEO", "APROBADA", "EN_REVISION_CONTA"].includes(String(liq["estado"])))
    return { ok: false, mensaje: `Solo se puede reconciliar un informe con ERROR DE POSTEO o pendiente de posteo (estado actual: ${liq["estado"]}).` };
  await marcarPosteado(db, id, num);
  return { ok: true, mensaje: `Informe marcado POSTEADA con el reporte FO ${num}.`, numeroReporteFO: num };
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
