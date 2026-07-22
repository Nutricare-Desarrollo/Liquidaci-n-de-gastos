// Carga/actualiza la liquidacion para el posteo a FO.
import type { Db } from "./client.js";
import type { UsuariosPort } from "../ports/index.js";
import type { InformeParaPostear } from "../services/posteoFO.js";
import type { Empresa, MetodoPago, Moneda, SituacionFiscal } from "../domain/types.js";
import { situacionFromDb } from "./map.js";

/** Arma el InformeParaPostear leyendo la liquidacion con sus gastos. */
export async function cargarInforme(db: Db, liquidacionId: string, usuarios?: UsuariosPort): Promise<InformeParaPostear | null> {
  const liq = (await db.liquidacion.findUnique({
    where: { id: liquidacionId },
  })) as Record<string, unknown> | null;
  if (!liq) return null;

  // personnelNumber: 1) tabla local de empleados (por correo, mapeo de la app),
  //                    2) fallback al employeeId de Entra (por oid/correo).
  const correo = String(liq["correoEmpleado"] ?? "").toLowerCase();
  const empleado = correo
    ? ((await db.usuario.findFirst({ where: { email: correo } })) as Record<string, unknown> | null)
    : null;

  let personnelNumber = String(empleado?.["personnelNumber"] ?? "");
  if (!personnelNumber && usuarios) {
    const u = (await usuarios.listar()).find((x) => x.id === String(liq["empleadoId"]) || x.email === correo);
    personnelNumber = u?.personnelNumber ?? "";
  }

  const gastos = (await db.gasto.findMany({
    where: { liquidacionId },
    include: { categoria: true },
  } as unknown)) as Array<Record<string, unknown>>;

  // Mapa centroCostoId -> operatingUnitNumber (para la dimension financiera en FO).
  const centros = (await db.centroCosto.findMany()) as Array<Record<string, unknown>>;
  const ccPorId = new Map(centros.map((c) => [String(c["id"]), c] as [string, Record<string, unknown>]));

  return {
    id: String(liq["id"]),
    numeroReporteFO: (liq["numeroReporteFO"] as string | null) ?? null,
    empresa: String(liq["empresa"]).toLowerCase() as Empresa,
    personnelNumber,
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
      receiptNumber: String(g["numeroFactura"] ?? ""),
      merchant: String(g["comerciante"] ?? ""),
      zone: g["zona"] != null ? String(g["zona"]) : undefined,
      km: g["kilometros"] != null ? Number(g["kilometros"]) : undefined,
      costCenter: g["centroCostoId"] ? (String(ccPorId.get(String(g["centroCostoId"]))?.["operatingUnitNumber"] ?? "") || undefined) : undefined,
      departamento: g["centroCostoId"] ? (String(ccPorId.get(String(g["centroCostoId"]))?.["departamento"] ?? "") || undefined) : undefined,
      unidadNegocio: g["centroCostoId"] ? (String(ccPorId.get(String(g["centroCostoId"]))?.["unidadNegocio"] ?? "") || undefined) : undefined,
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
