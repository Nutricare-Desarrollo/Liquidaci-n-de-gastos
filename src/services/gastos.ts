// =====================================================================
//  Dividir gastos y crear gasto de Regimen Simplificado (traspaso 8).
// =====================================================================
import type { Db } from "../db/client.js";
import { metodoPago } from "../domain/metodoPago.js";
import { evaluarLimite } from "../domain/reglasMonto.js";
import { resolverGrupoImpuesto } from "../domain/grupoImpuesto.js";
import { monedaToDb, situacionToDb } from "../db/map.js";
import type { Moneda, ReglaMonto, SituacionFiscal } from "../domain/types.js";
import { propositoDeClave, categoriaEsValida, permiteUnSoloGasto } from "../domain/proposito.js";
import type { StoragePort } from "../ports/index.js";

type Rec = Record<string, unknown>;

async function recalcular(db: Db, liquidacionId: string): Promise<void> {
  const gastos = (await db.gasto.findMany({ where: { liquidacionId } })) as Rec[];
  const total = gastos.reduce((s, g) => s + Number(g["montoTotal"] ?? 0), 0);
  await db.liquidacion.update({ where: { id: liquidacionId }, data: { montoInforme: total } });
}

async function reglasDominio(db: Db): Promise<ReglaMonto[]> {
  const rs = (await db.reglaMonto.findMany({ where: { activo: true } })) as Rec[];
  return rs.map((r) => ({
    categoriaCodigo: String(r["categoriaCodigo"]),
    montoMaxCRC: Number(r["montoMaxCRC"]), montoMaxUSD: Number(r["montoMaxUSD"]), activo: Boolean(r["activo"]),
  }));
}

// ---- Dividir un gasto en uno derivado (con su propio monto y centro de costo) ----
export async function dividirGasto(db: Db, gastoId: string, opts: {
  monto: number; centroCostoId: string | null; categoriaId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const orig = (await db.gasto.findUnique({ where: { id: gastoId } })) as Rec | null;
  if (!orig) return { ok: false, error: "El gasto no existe." };
  const montoOrig = Number(orig["montoTotal"] ?? 0);
  const monto = Number(opts.monto);
  if (!(monto > 0) || monto >= montoOrig)
    return { ok: false, error: `El monto a dividir debe ser mayor que 0 y menor que ${montoOrig}.` };

  const liquidacionId = String(orig["liquidacionId"]);
  const moneda = String(orig["moneda"]) as Moneda;
  const categoriaId = opts.categoriaId || String(orig["categoriaId"]);
  const cat = (await db.categoria.findUnique({ where: { id: categoriaId } })) as Rec | null;
  const reglas = await reglasDominio(db);

  const limiteDer = evaluarLimite({ categoriaCodigo: String(cat?.["codigo"] ?? ""), monto, monedaInforme: moneda, reglas });

  await db.gasto.create({
    data: {
      name: `GAS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      liquidacionId, facturaId: (orig["facturaId"] as string | null) ?? null,
      capturaId: null, gastoOrigenId: gastoId,
      montoTotal: monto, moneda: monedaToDb(moneda), fecha: orig["fecha"],
      categoriaId, comerciante: orig["comerciante"], centroCostoId: opts.centroCostoId,
      metodoPago: orig["metodoPago"], situacionFiscal: orig["situacionFiscal"],
      grupoImpuesto: cat ? String(cat["taxItemGroup"]) : orig["grupoImpuesto"],
      litros: null, tipoGasolina: null,
      excedeLimite: limiteDer.excede, alerta: limiteDer.alerta,
      urlPdf: (orig["urlPdf"] as string | null) ?? null,
      tipoComprobante: orig["tipoComprobante"] ?? "FACTURA_ELECTRONICA",
    },
  });

  // Reducir el original y reevaluar su limite con el nuevo monto.
  const catOrig = (await db.categoria.findUnique({ where: { id: String(orig["categoriaId"]) } })) as Rec | null;
  const nuevoMontoOrig = montoOrig - monto;
  const limiteOrig = evaluarLimite({ categoriaCodigo: String(catOrig?.["codigo"] ?? ""), monto: nuevoMontoOrig, monedaInforme: moneda, reglas });
  await db.gasto.update({ where: { id: gastoId }, data: { montoTotal: nuevoMontoOrig, excedeLimite: limiteOrig.excede, alerta: limiteOrig.alerta } });

  await recalcular(db, liquidacionId);
  return { ok: true };
}

// ---- Crear gasto de Regimen Simplificado (sin factura electronica) ----
export async function crearGastoSimplificado(db: Db, liquidacionId: string, opts: {
  monto: number; fecha: string; comerciante: string; categoriaId: string;
  situacionFiscal: SituacionFiscal; centroCostoId?: string | null;
  capturaId?: string; adjunto?: { nombre: string; url: string; tipo: string }; numeroFactura?: string;
  zona?: string | null; kilometros?: number | null; tipoComprobante?: string;
  litros?: number | null; tipoGasolina?: string | null;
}): Promise<{ ok: boolean; error?: string; gastoId?: string }> {
  const liq = (await db.liquidacion.findUnique({ where: { id: liquidacionId } })) as Rec | null;
  const cat = (await db.categoria.findUnique({ where: { id: opts.categoriaId } })) as Rec | null;
  if (!liq || !cat) return { ok: false, error: "Falta liquidación o categoría." };
  if (!(Number(opts.monto) > 0)) return { ok: false, error: "El monto debe ser mayor que 0." };

  const moneda = String(liq["moneda"]) as Moneda;
  const proposito = propositoDeClave(String(liq["proposito"]));

  // Regla por proposito: categoria permitida.
  if (!categoriaEsValida(proposito, String(cat["codigo"])))
    return { ok: false, error: `La categoría ${cat["codigo"]} no es válida para el propósito ${proposito}.` };

  // Regla ANTICIPOS: un solo gasto por liquidacion.
  if (permiteUnSoloGasto(proposito)) {
    const yaHay = (await db.gasto.findMany({ where: { liquidacionId } })) as Rec[];
    if (yaHay.length > 0) return { ok: false, error: "Un informe de ANTICIPOS admite un único gasto." };
  }
  const reglas = await reglasDominio(db);
  const grupos = (await db.grupoImpuesto.findMany()) as Rec[];
  const grupo = resolverGrupoImpuesto({ taxItemGroupCategoria: String(cat["taxItemGroup"]), gruposDisponibles: grupos.map((g) => String(g["name"])) });

  // KILOMETRAJE: si hay tarifa por km configurada (>0) para la zona, el monto = km * tarifa.
  // Si la tarifa esta en 0 (aun no cargada), se usa el monto ingresado a mano.
  let montoFinal = Number(opts.monto);
  if (opts.zona && opts.kilometros != null) {
    const tarifa = (await db.tarifaKm.findFirst({ where: { zona: opts.zona, activo: true } })) as Rec | null;
    const t = Number(tarifa?.["montoPorKm"] ?? 0);
    if (t > 0) montoFinal = t * Number(opts.kilometros);
  }
  const limite = evaluarLimite({ categoriaCodigo: String(cat["codigo"]), monto: montoFinal, monedaInforme: moneda, reglas });

  const creado = (await db.gasto.create({
    data: {
      name: `GAS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      liquidacionId, facturaId: null, capturaId: opts.capturaId ?? null,
      adjuntos: opts.adjunto ? [opts.adjunto] : undefined,
      numeroFactura: opts.numeroFactura ?? null,
      montoTotal: montoFinal, moneda: monedaToDb(moneda), fecha: new Date(opts.fecha),
      categoriaId: opts.categoriaId, comerciante: opts.comerciante,
      centroCostoId: opts.centroCostoId ?? (liq["centroCostoId"] as string | null) ?? null,
      metodoPago: metodoPago(proposito, moneda), situacionFiscal: situacionToDb(opts.situacionFiscal),
      grupoImpuesto: grupo.grupo, litros: opts.litros ?? null, tipoGasolina: opts.tipoGasolina ?? null,
      zona: opts.zona ?? null, kilometros: opts.kilometros ?? null,
      excedeLimite: limite.excede, alerta: limite.alerta, urlPdf: null,
      tipoComprobante: (opts.tipoComprobante ?? "REGIMEN_SIMPLIFICADO"),
    },
  })) as Rec;
  await recalcular(db, liquidacionId);
  return { ok: true, gastoId: String((creado as Rec)["id"]) };
}

export interface Adjunto { nombre: string; url: string; tipo: string; }

// Sube un adjunto (imagen/PDF) a un gasto via el puerto de almacenamiento.
// En produccion el StoragePort puede apuntar a SharePoint (ver adapters/azure/sharepointStorage).
export async function subirAdjunto(db: Db, storage: StoragePort, gastoId: string, a: {
  nombre: string; contenidoBase64: string; mimeType: string;
}): Promise<{ ok: boolean; error?: string; adjuntos?: Adjunto[] }> {
  const g = (await db.gasto.findUnique({ where: { id: gastoId } })) as Rec | null;
  if (!g) return { ok: false, error: "El gasto no existe." };
  const url = await storage.guardar({
    contenido: Buffer.from(a.contenidoBase64, "base64"),
    ruta: `gastos/${gastoId}/${Date.now()}-${a.nombre}`,
    mimeType: a.mimeType,
  });
  const adjuntos: Adjunto[] = Array.isArray(g["adjuntos"]) ? (g["adjuntos"] as Adjunto[]) : [];
  adjuntos.push({ nombre: a.nombre, url, tipo: a.mimeType });
  await db.gasto.update({ where: { id: gastoId }, data: { adjuntos } });
  return { ok: true, adjuntos };
}
