// Carga/actualiza la liquidacion para el posteo a FO.
import type { Db } from "./client.js";
import type { InformeParaPostear } from "../services/posteoFO.js";
import type { Empresa, MetodoPago, Moneda, SituacionFiscal } from "../domain/types.js";
import { situacionFromDb } from "./map.js";

/** Arma el InformeParaPostear leyendo la liquidacion con sus gastos. */
export async function cargarInforme(db: Db, liquidacionId: string): Promise<InformeParaPostear | null> {
  const liq = (await db.liquidacion.findUnique({
    where: { id: liquidacionId },
  })) as Record<string, unknown> | null;
  if (!liq) return null;

  const empleado = (await db.usuario.findUnique({
    where: { id: String(liq["empleadoId"]) },
  })) as Record<string, unknown> | null;

  const gastos = (await db.gasto.findMany({
    where: { liquidacionId },
    include: { categoria: true },
  } as unknown)) as Array<Record<string, unknown>>;

  return {
    id: String(liq["id"]),
    numeroReporteFO: (liq["numeroReporteFO"] as string | null) ?? null,
    empresa: String(liq["empresa"]).toLowerCase() as Empresa,
    personnelNumber: String(empleado?.["personnelNumber"] ?? ""),
    purpose: String(liq["proposito"]),
    descripcion: String(liq["name"] ?? ""),
    gastos: gastos.map((g) => ({
      costType: String((g["categoria"] as Record<string, unknown> | undefined)?.["codigo"] ?? ""),
      amount: Number(g["montoTotal"]),
      currency: String(g["moneda"]) as Moneda,
      payMethod: String(g["metodoPago"]) as MetodoPago,
      transDate: (g["fecha"] as Date)?.toISOString?.() ?? String(g["fecha"]),
      description: String(g["comerciante"] ?? ""),
      taxGroup: situacionFromDb(g["situacionFiscal"] as "IVA" | "EXENTO" | "NO_SUJETO" | "SIN_DEFINIR"),
      taxItemGroup: String(g["grupoImpuesto"] ?? ""),
    })),
  };
}

/** Marca la liquidacion como posteada con el numero de reporte FO. */
export async function marcarPosteado(db: Db, liquidacionId: string, numeroReporteFO: string): Promise<void> {
  await db.liquidacion.update({
    where: { id: liquidacionId },
    data: { numeroReporteFO, estado: "POSTEADA" },
  });
}
