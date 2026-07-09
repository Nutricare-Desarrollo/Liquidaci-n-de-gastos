import type { Db } from "./client.js";
import type { FacturaRepo, FacturaPersistida } from "../services/ingestaFactura.js";
import { monedaToDb, situacionToDb } from "./map.js";

// Implementacion de FacturaRepo sobre Prisma/Postgres.
export class PrismaFacturaRepo implements FacturaRepo {
  constructor(private readonly db: Db) {}

  async existePorClave(clave: string): Promise<boolean> {
    const found = await this.db.factura.findUnique({ where: { clave } });
    return found !== null;
  }

  async guardar(f: FacturaPersistida): Promise<void> {
    await this.db.factura.create({
      data: {
        clave: f.clave,
        consecutivo: f.consecutivo,
        fechaEmision: f.fechaEmision ? new Date(f.fechaEmision) : null,
        emisorNombre: f.emisorNombre,
        emisorIdentificacion: f.emisorIdentificacion,
        receptorIdentificacion: f.receptorIdentificacion,
        esDeLaEmpresa: f.esDeLaEmpresa,
        totalComprobante: f.totalComprobante,
        totalImpuesto: f.totalImpuesto,
        totalGravado: f.totalGravado,
        totalExento: f.totalExento,
        totalNoSujeto: f.totalNoSujeto,
        moneda: monedaToDb(f.moneda),
        situacionFiscal: situacionToDb(f.situacionFiscal),
        cantidad: f.cantidad,
        detalle: f.detalle,
        urlPdf: f.urlPdf,
      },
    });
  }
}
