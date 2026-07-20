// =====================================================================
//  Motor de cruce (traspaso 4.3) + creacion de gasto desde factura.
//  Al crear un gasto (por cruce o manual) la factura queda CRUZADA y la
//  captura (si hay) tambien, para que no vuelvan a estar disponibles.
// =====================================================================
import type { Db } from "../db/client.js";
import { cruza } from "../domain/cruce.js";
import { construirGasto } from "../domain/construirGasto.js";
import { monedaToDb, situacionToDb } from "../db/map.js";
import type {
  Categoria, Empresa, Moneda, ReglaMonto, SituacionFiscal, TipoGasolina,
} from "../domain/types.js";
import { propositoDeClave } from "../domain/proposito.js";

type Rec = Record<string, unknown>;
const SITUACION_DB_A_DOMINIO: Record<string, SituacionFiscal> = {
  IVA: "IVA", EXENTO: "EXENTO", NO_SUJETO: "NO SUJETO", SIN_DEFINIR: "",
};
const TIPO_GAS_A_DB: Record<number, string> = { 1: "GASOLINA", 2: "DIESEL", 3: "GAS_LP" };

async function recalcularMonto(db: Db, liquidacionId: string): Promise<void> {
  const gastos = (await db.gasto.findMany({ where: { liquidacionId } })) as Rec[];
  const total = gastos.reduce((s, g) => s + Number(g["montoTotal"] ?? 0), 0);
  await db.liquidacion.update({ where: { id: liquidacionId }, data: { montoInforme: total } });
}

/**
 * Crea el gasto para una factura dentro de una liquidacion (cruce o manual).
 * Marca la factura como CRUZADA y, si viene captura, tambien la captura.
 * Devuelve true si lo creo, false si faltaban datos (liq/categoria).
 */
export async function crearGastoDesdeFactura(db: Db, opts: {
  liquidacionId: string; factura: Rec; categoriaId: string; capturaId?: string;
}): Promise<boolean> {
  const { liquidacionId, factura, categoriaId, capturaId } = opts;

  const liq = (await db.liquidacion.findUnique({ where: { id: liquidacionId } })) as Rec | null;
  const cat = (await db.categoria.findUnique({ where: { id: categoriaId } })) as Rec | null;
  if (!liq || !cat) return false;

  const grupos = (await db.grupoImpuesto.findMany()) as Rec[];
  const reglasDb = (await db.reglaMonto.findMany({ where: { activo: true } })) as Rec[];

  const categoria: Categoria = {
    codigo: String(cat["codigo"]), nombre: String(cat["nombre"]),
    taxItemGroup: String(cat["taxItemGroup"]), expenseType: String(cat["expenseType"]),
    empresa: String(cat["empresa"]).toLowerCase() as Empresa, activo: Boolean(cat["activo"]),
  };
  const reglas: ReglaMonto[] = reglasDb.map((r) => ({
    categoriaCodigo: String(r["categoriaCodigo"]),
    montoMaxCRC: Number(r["montoMaxCRC"]), montoMaxUSD: Number(r["montoMaxUSD"]), activo: Boolean(r["activo"]),
  }));

  const g = construirGasto({
    factura: {
      clave: String(factura["clave"]), consecutivo: String(factura["consecutivo"] ?? ""),
      fechaEmision: (factura["fechaEmision"] as Date)?.toISOString?.() ?? String(factura["fechaEmision"]),
      emisorNombre: String(factura["emisorNombre"] ?? ""),
      emisorIdentificacion: String(factura["emisorIdentificacion"] ?? ""),
      receptorIdentificacion: String(factura["receptorIdentificacion"] ?? ""),
      totalComprobante: Number(factura["totalComprobante"]),
      totalImpuesto: Number(factura["totalImpuesto"]), totalGravado: Number(factura["totalGravado"]),
      totalExento: Number(factura["totalExento"]), totalNoSujeto: Number(factura["totalNoSujeto"]),
      moneda: String(factura["moneda"]) as Moneda,
      situacionFiscal: SITUACION_DB_A_DOMINIO[String(factura["situacionFiscal"])] ?? "",
      cantidad: Number(factura["cantidad"] ?? 0), detalle: String(factura["detalle"] ?? ""),
      urlPdf: (factura["urlPdf"] as string | null) ?? null,
    },
    liquidacion: {
      proposito: propositoDeClave(String(liq["proposito"])),
      moneda: String(liq["moneda"]) as Moneda,
      centroCostoId: (liq["centroCostoId"] as string | null) ?? null,
    },
    categoria, gruposImpuestoDisponibles: grupos.map((x) => String(x["name"])), reglas,
  });

  await db.gasto.create({
    data: {
      name: `GAS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      liquidacionId, facturaId: String(factura["id"]), capturaId: capturaId ?? null,
      montoTotal: g.montoTotal, moneda: monedaToDb(g.moneda), fecha: new Date(g.fecha),
      categoriaId, comerciante: g.comerciante, centroCostoId: g.centroCostoId,
      numeroFactura: String(factura["consecutivo"] ?? ""),
      metodoPago: g.metodoPago, situacionFiscal: situacionToDb(g.situacionFiscal),
      grupoImpuesto: g.grupoImpuesto, litros: g.litros,
      tipoGasolina: g.tipoGasolina !== null ? TIPO_GAS_A_DB[g.tipoGasolina as TipoGasolina] : null,
      excedeLimite: g.excedeLimite, alerta: g.alerta, urlPdf: g.urlPdf,
    },
  });

  // Marcar estados: la factura y la captura ya no estan disponibles para cruces.
  await db.factura.update({ where: { id: String(factura["id"]) }, data: { estado: "CRUZADA" } });
  if (capturaId) {
    await db.captura.update({ where: { id: capturaId }, data: { estado: "CRUZADA", clave: String(factura["clave"]), facturaId: String(factura["id"]) } });
  }
  await recalcularMonto(db, liquidacionId);
  return true;
}

export interface ResultadoCruce { cruzados: number; sinFactura: number; }

export async function procesarCruce(db: Db): Promise<ResultadoCruce> {
  const capturas = (await db.captura.findMany({ where: { estado: "PENDIENTE_CRUCE", facturaId: null } })) as Rec[];
  const facturas = (await db.factura.findMany({ where: { estado: "SIN_CAPTURA", esDeLaEmpresa: true } })) as Rec[];

  let cruzados = 0;
  let sinFactura = 0;
  const usadas = new Set<string>();

  for (const cap of capturas) {
    const ocr = String(cap["contenidoOcr"] ?? "");
    const factura = facturas.find((f) => !usadas.has(String(f["id"])) && cruza(ocr, String(f["clave"])));
    if (!factura) { sinFactura++; continue; }
    const ok = await crearGastoDesdeFactura(db, {
      liquidacionId: String(cap["liquidacionId"]), factura, categoriaId: String(cap["categoriaId"]), capturaId: String(cap["id"]),
    });
    if (ok) { usadas.add(String(factura["id"])); cruzados++; }
  }
  return { cruzados, sinFactura };
}
