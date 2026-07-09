// =====================================================================
//  Modo demo: Db en memoria + adapters falsos + catalogos sembrados.
//  Incluye facturas sin cruzar precargadas para hacer demos sin pegar XML.
// =====================================================================
import type { Deps } from "../deps.js";
import { InMemoryDb } from "../adapters/memory/inMemoryDb.js";
import { PrismaFacturaRepo } from "../db/facturaRepo.js";
import { FakeAuth, FakeFinance, FakeNotificacion, FakeOcr, FakeStorage } from "../adapters/fakes.js";
import { DbUsuarios } from "../adapters/dbUsuarios.js";

const CEDULA = "3101179050";

export function buildDemoDeps(): Deps {
  const db = new InMemoryDb();
  seed(db);
  const facturaRepo = new PrismaFacturaRepo(db);
  return {
    demo: true,
    db,
    ocr: new FakeOcr(),
    storage: new FakeStorage(),
    auth: new FakeAuth(),
    finance: new FakeFinance(),
    notificacion: new FakeNotificacion(),
    correo: { poll: async () => ({ procesados: 0 }) },
    usuarios: new DbUsuarios(db),
    facturaRepo,
  };
}

function seed(db: InMemoryDb): void {
  db.stores.usuario.push(
    { id: "u-emp", email: "desarrollo@nutricare.co.cr", nombre: "Jose Pablo Badilla", personnelNumber: "NTC-0001" },
    { id: "u-apr", email: "asojo@nutricare.co.cr", nombre: "Alessandro Sojo Murillo", personnelNumber: "NTC-0002" },
    { id: "u-conta", email: "conta@nutricare.co.cr", nombre: "Contabilidad Nutricare", personnelNumber: "NTC-0003" },
    { id: "u-4", email: "mrojas@nutricare.co.cr", nombre: "Maria Rojas Vargas", personnelNumber: "NTC-0010" },
    { id: "u-5", email: "carrieta@nutricare.co.cr", nombre: "Carlos Arrieta Mora", personnelNumber: "NTC-0011" },
    { id: "u-6", email: "lgomez@nutricare.co.cr", nombre: "Laura Gomez Solis", personnelNumber: "NTC-0012" },
    { id: "u-7", email: "dchaves@nutricare.co.cr", nombre: "Diego Chaves Ureña", personnelNumber: "NTC-0013" },
    { id: "u-8", email: "avargas@nutricare.co.cr", nombre: "Ana Vargas Leon", personnelNumber: "NTC-0014" },
    { id: "u-9", email: "jmora@nutricare.co.cr", nombre: "Javier Mora Castro", personnelNumber: "NTC-0015" },
    { id: "u-10", email: "psanchez@nutricare.co.cr", nombre: "Paola Sanchez Jimenez", personnelNumber: "NTC-0016" },
  );

  const cats: Array<[string, string, string, string]> = [
    ["COMBUSTIBLES", "Combustibles", "EXENTO", "Transport"],
    ["DESAYUNO", "Desayuno", "IVA 13%", "Meals"],
    ["ALMUERZO", "Almuerzo", "IVA 13%", "Meals"],
    ["CENA", "Cena", "IVA 13%", "Meals"],
    ["HOSPEDAJE", "Hospedaje", "IVA 13%", "Hotel"],
    ["SUMINISTROS", "Suministros", "IVA 13%", "Expense"],
  ];
  for (const empresa of ["ntc", "feh"] as const) {
    for (const [codigo, nombre, tig, et] of cats) {
      db.stores.categoria.push({ id: `cat-${empresa}-${codigo}`, codigo, nombre, taxItemGroup: tig, expenseType: et, empresa, activo: true });
    }
  }

  db.stores.centroCosto.push(
    { id: "cc-adm", operatingUnitNumber: "ADM", name: "Administracion" },
    { id: "cc-ven", operatingUnitNumber: "VEN", name: "Ventas" },
    { id: "cc-log", operatingUnitNumber: "LOG", name: "Logistica" },
  );

  for (const name of ["IVA 13%", "IVA 4%", "IVA 2%", "IVA 1%", "EXENTO", "NO SUJETO"]) {
    db.stores.grupoImpuesto.push({ id: `gi-${name}`, name });
  }

  db.stores.reglaMonto.push(
    { id: "r-des", categoriaCodigo: "DESAYUNO", montoMaxCRC: 5000, montoMaxUSD: 10, activo: true },
    { id: "r-alm", categoriaCodigo: "ALMUERZO", montoMaxCRC: 8000, montoMaxUSD: 16, activo: true },
    { id: "r-cen", categoriaCodigo: "CENA", montoMaxCRC: 10000, montoMaxUSD: 20, activo: true },
  );

  seedFacturas(db);
}

// Facturas de demo: todas de Nutricare, sin cruzar (SIN_CAPTURA).
function seedFacturas(db: InMemoryDb): void {
  let n = 1;
  const clave = () => ("506" + String(n).padStart(3, "0") + "0626003101" + String(100000 + n).padStart(6, "0") + "0".repeat(50)).slice(0, 50);
  const F = (o: {
    emisor: string; ced: string; total: number; sit: "IVA" | "EXENTO" | "NO_SUJETO";
    detalle: string; cantidad?: number; fecha: string;
  }) => {
    const iva = o.sit === "IVA";
    db.stores.factura.push({
      id: `fac-demo-${n}`, clave: clave(), consecutivo: `00100001010000${String(100 + n).padStart(6, "0")}`,
      fechaEmision: new Date(o.fecha), emisorNombre: o.emisor, emisorIdentificacion: o.ced,
      receptorIdentificacion: CEDULA, esDeLaEmpresa: true,
      totalComprobante: o.total,
      totalImpuesto: iva ? Math.round((o.total * 0.13) / 1.13) : 0,
      totalGravado: iva ? Math.round(o.total / 1.13) : 0,
      totalExento: o.sit === "EXENTO" ? o.total : 0,
      totalNoSujeto: o.sit === "NO_SUJETO" ? o.total : 0,
      moneda: "CRC", situacionFiscal: o.sit,
      cantidad: o.cantidad ?? 0, detalle: o.detalle, urlPdf: null, estado: "SIN_CAPTURA",
    });
    n++;
  };

  F({ emisor: "SERVICENTRO SAN JOSE S.A.", ced: "3101111111", total: 32450, sit: "NO_SUJETO", detalle: "GASOLINA SUPER", cantidad: 43.1, fecha: "2026-06-03T09:15:00-06:00" });
  F({ emisor: "ESTACION LA UNION LTDA", ced: "3101222222", total: 51200, sit: "NO_SUJETO", detalle: "DIESEL", cantidad: 76.4, fecha: "2026-06-05T17:40:00-06:00" });
  F({ emisor: "COMBUSTIBLES DEL VALLE S.A.", ced: "3101333333", total: 27800, sit: "EXENTO", detalle: "GASOLINA REGULAR", cantidad: 37.2, fecha: "2026-06-08T07:05:00-06:00" });
  F({ emisor: "RESTAURANTE EL BUEN SABOR", ced: "3101444444", total: 6500, sit: "IVA", detalle: "Almuerzo ejecutivo", fecha: "2026-06-10T13:20:00-06:00" });
  F({ emisor: "SODA LA CENTRAL", ced: "3101555555", total: 12800, sit: "IVA", detalle: "Almuerzo de equipo (excede tope)", fecha: "2026-06-11T12:50:00-06:00" });
  F({ emisor: "HOTEL VISTA MAR S.A.", ced: "3101666666", total: 54900, sit: "IVA", detalle: "Hospedaje 1 noche", fecha: "2026-06-14T20:00:00-06:00" });
  F({ emisor: "LIBRERIA UNIVERSAL", ced: "3101777777", total: 18300, sit: "IVA", detalle: "Suministros de oficina", fecha: "2026-06-16T10:30:00-06:00" });
}
