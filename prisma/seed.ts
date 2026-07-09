// Seed de catalogos + usuarios + facturas demo para el modo real (Postgres).
// Correr: npm run prisma:seed  (idempotente: usa upsert).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const CEDULA = "3101179050";

async function main() {
  // Usuarios / aprobadores
  const usuarios = [
    ["desarrollo@nutricare.co.cr", "Jose Pablo Badilla", "NTC-0001"],
    ["asojo@nutricare.co.cr", "Alessandro Sojo Murillo", "NTC-0002"],
    ["conta@nutricare.co.cr", "Contabilidad Nutricare", "NTC-0003"],
    ["mrojas@nutricare.co.cr", "Maria Rojas Vargas", "NTC-0010"],
    ["carrieta@nutricare.co.cr", "Carlos Arrieta Mora", "NTC-0011"],
    ["lgomez@nutricare.co.cr", "Laura Gomez Solis", "NTC-0012"],
    ["dchaves@nutricare.co.cr", "Diego Chaves Urena", "NTC-0013"],
    ["avargas@nutricare.co.cr", "Ana Vargas Leon", "NTC-0014"],
    ["jmora@nutricare.co.cr", "Javier Mora Castro", "NTC-0015"],
    ["psanchez@nutricare.co.cr", "Paola Sanchez Jimenez", "NTC-0016"],
  ];
  for (const [email, nombre, pn] of usuarios) {
    await db.usuario.upsert({ where: { email }, update: { nombre, personnelNumber: pn }, create: { email, nombre, personnelNumber: pn } });
  }

  // Categorias (ntc + feh). En produccion se cargan desde ExpenseCategories de FO.
  const cats: Array<[string, string, string, string]> = [
    ["COMBUSTIBLES", "Combustibles", "EXENTO", "Transport"],
    ["DESAYUNO", "Desayuno", "IVA 13%", "Meals"],
    ["ALMUERZO", "Almuerzo", "IVA 13%", "Meals"],
    ["CENA", "Cena", "IVA 13%", "Meals"],
    ["HOSPEDAJE", "Hospedaje", "IVA 13%", "Hotel"],
    ["SUMINISTROS", "Suministros", "IVA 13%", "Expense"],
  ];
  for (const empresa of ["ntc", "feh"] as const) {
    for (const [codigo, nombre, taxItemGroup, expenseType] of cats) {
      await db.categoria.upsert({
        where: { codigo_empresa: { codigo, empresa } },
        update: { nombre, taxItemGroup, expenseType, activo: true },
        create: { codigo, nombre, taxItemGroup, expenseType, empresa, activo: true },
      });
    }
  }

  // Centros de costo
  for (const [operatingUnitNumber, name] of [["ADM", "Administracion"], ["VEN", "Ventas"], ["LOG", "Logistica"]]) {
    await db.centroCosto.upsert({ where: { operatingUnitNumber }, update: { name }, create: { operatingUnitNumber, name } });
  }

  // Grupos de impuesto (valor exacto de FO)
  for (const name of ["IVA 13%", "IVA 4%", "IVA 2%", "IVA 1%", "EXENTO", "NO SUJETO"]) {
    await db.grupoImpuesto.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Reglas de monto
  const reglas: Array<[string, number, number]> = [["DESAYUNO", 5000, 10], ["ALMUERZO", 8000, 16], ["CENA", 10000, 20]];
  for (const [categoriaCodigo, montoMaxCRC, montoMaxUSD] of reglas) {
    await db.reglaMonto.upsert({ where: { categoriaCodigo }, update: { montoMaxCRC, montoMaxUSD, activo: true }, create: { categoriaCodigo, montoMaxCRC, montoMaxUSD, activo: true } });
  }

  // Facturas demo (sin cruzar) para probar
  const facturas = [
    ["SERVICENTRO SAN JOSE S.A.", "3101111111", 32450, "NO_SUJETO", "GASOLINA SUPER", 43.1],
    ["ESTACION LA UNION LTDA", "3101222222", 51200, "NO_SUJETO", "DIESEL", 76.4],
    ["COMBUSTIBLES DEL VALLE S.A.", "3101333333", 27800, "EXENTO", "GASOLINA REGULAR", 37.2],
    ["RESTAURANTE EL BUEN SABOR", "3101444444", 6500, "IVA", "Almuerzo ejecutivo", 0],
    ["SODA LA CENTRAL", "3101555555", 12800, "IVA", "Almuerzo de equipo (excede tope)", 0],
    ["HOTEL VISTA MAR S.A.", "3101666666", 54900, "IVA", "Hospedaje 1 noche", 0],
    ["LIBRERIA UNIVERSAL", "3101777777", 18300, "IVA", "Suministros de oficina", 0],
  ] as const;
  let n = 1;
  for (const [emisor, ced, total, sit, detalle, cant] of facturas) {
    const clave = ("506" + String(n).padStart(3, "0") + "0626003101" + String(100000 + n).padStart(6, "0") + "0".repeat(50)).slice(0, 50);
    const iva = sit === "IVA";
    await db.factura.upsert({
      where: { clave },
      update: {},
      create: {
        clave, consecutivo: `00100001010000${String(100 + n).padStart(6, "0")}`,
        fechaEmision: new Date(), emisorNombre: emisor, emisorIdentificacion: ced,
        receptorIdentificacion: CEDULA, esDeLaEmpresa: true, totalComprobante: total,
        totalImpuesto: iva ? Math.round((total * 0.13) / 1.13) : 0,
        totalGravado: iva ? Math.round(total / 1.13) : 0,
        totalExento: sit === "EXENTO" ? total : 0,
        totalNoSujeto: sit === "NO_SUJETO" ? total : 0,
        moneda: "CRC", situacionFiscal: sit as "IVA" | "EXENTO" | "NO_SUJETO",
        cantidad: cant, detalle, estado: "SIN_CAPTURA",
      },
    });
    n++;
  }
  console.log("Seed completado.");
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
