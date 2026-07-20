// Crear/editar facturas manualmente (cuando no llega el XML por correo, o
// para corregir montos, incluso si ya estan cruzadas: propaga el cambio al gasto.
import type { Db } from "../db/client.js";
import { situacionToDb, monedaToDb } from "../db/map.js";
import type { Moneda, SituacionFiscal } from "../domain/types.js";

type Rec = Record<string, unknown>;
const CEDULA = "3101179050";

export interface FacturaManualInput {
  clave: string; consecutivo?: string; emisorNombre?: string; emisorIdentificacion?: string;
  fechaEmision?: string; moneda: Moneda; situacionFiscal: SituacionFiscal;
  totalComprobante: number; totalImpuesto?: number; totalGravado?: number; totalExento?: number; totalNoSujeto?: number;
  cantidad?: number; detalle?: string;
}

export async function crearFacturaManual(db: Db, d: FacturaManualInput): Promise<{ ok: boolean; error?: string }> {
  const clave = (d.clave ?? "").replace(/\s/g, "");
  if (!clave) return { ok: false, error: "La clave es obligatoria." };
  if (!(Number(d.totalComprobante) > 0)) return { ok: false, error: "El total debe ser mayor que 0." };
  const existe = (await db.factura.findUnique({ where: { clave } })) as Rec | null;
  if (existe) return { ok: false, error: "Ya existe una factura con esa clave." };
  await db.factura.create({
    data: {
      clave, consecutivo: d.consecutivo ?? "", fechaEmision: d.fechaEmision ? new Date(d.fechaEmision) : new Date(),
      emisorNombre: d.emisorNombre ?? "", emisorIdentificacion: d.emisorIdentificacion ?? "",
      receptorIdentificacion: CEDULA, esDeLaEmpresa: true,
      totalComprobante: Number(d.totalComprobante),
      totalImpuesto: Number(d.totalImpuesto ?? 0), totalGravado: Number(d.totalGravado ?? 0),
      totalExento: Number(d.totalExento ?? 0), totalNoSujeto: Number(d.totalNoSujeto ?? 0),
      moneda: monedaToDb(d.moneda), situacionFiscal: situacionToDb(d.situacionFiscal),
      cantidad: d.cantidad ?? 0, detalle: d.detalle ?? "", urlPdf: null, estado: "SIN_CAPTURA",
    },
  });
  return { ok: true };
}

export async function actualizarFactura(db: Db, id: string, patch: Partial<FacturaManualInput>): Promise<{ ok: boolean; error?: string }> {
  const f = (await db.factura.findUnique({ where: { id } })) as Rec | null;
  if (!f) return { ok: false, error: "La factura no existe." };
  const data: Rec = {};
  if (patch.consecutivo !== undefined) data["consecutivo"] = patch.consecutivo;
  if (patch.emisorNombre !== undefined) data["emisorNombre"] = patch.emisorNombre;
  if (patch.emisorIdentificacion !== undefined) data["emisorIdentificacion"] = patch.emisorIdentificacion;
  if (patch.detalle !== undefined) data["detalle"] = patch.detalle;
  if (patch.cantidad !== undefined) data["cantidad"] = Number(patch.cantidad);
  if (patch.moneda !== undefined) data["moneda"] = monedaToDb(patch.moneda);
  if (patch.situacionFiscal !== undefined) data["situacionFiscal"] = situacionToDb(patch.situacionFiscal);
  if (patch.totalComprobante !== undefined) data["totalComprobante"] = Number(patch.totalComprobante);
  if (patch.totalImpuesto !== undefined) data["totalImpuesto"] = Number(patch.totalImpuesto);
  if (patch.totalGravado !== undefined) data["totalGravado"] = Number(patch.totalGravado);
  if (patch.totalExento !== undefined) data["totalExento"] = Number(patch.totalExento);
  if (patch.totalNoSujeto !== undefined) data["totalNoSujeto"] = Number(patch.totalNoSujeto);
  await db.factura.update({ where: { id }, data });

  // Propagar a los gastos principales (no divisiones) asociados a esta factura.
  const nuevoTotal = patch.totalComprobante !== undefined ? Number(patch.totalComprobante) : undefined;
  const nuevaSit = patch.situacionFiscal !== undefined ? situacionToDb(patch.situacionFiscal) : undefined;
  if (nuevoTotal !== undefined || nuevaSit !== undefined) {
    const gastos = (await db.gasto.findMany({ where: { facturaId: id } })) as Rec[];
    const liqs = new Set<string>();
    for (const g of gastos) {
      if (g["gastoOrigenId"]) continue; // no tocar divisiones (llevan su propio monto)
      const gd: Rec = {};
      if (nuevoTotal !== undefined) gd["montoTotal"] = nuevoTotal;
      if (nuevaSit !== undefined) gd["situacionFiscal"] = nuevaSit;
      await db.gasto.update({ where: { id: String(g["id"]) }, data: gd });
      liqs.add(String(g["liquidacionId"]));
    }
    for (const liqId of liqs) {
      const gs = (await db.gasto.findMany({ where: { liquidacionId: liqId } })) as Rec[];
      const total = gs.reduce((acc, x) => acc + Number(x["montoTotal"] ?? 0), 0);
      await db.liquidacion.update({ where: { id: liqId }, data: { montoInforme: total } });
    }
  }
  return { ok: true };
}
