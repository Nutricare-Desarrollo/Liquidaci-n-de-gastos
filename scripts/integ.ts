// Prueba de integracion (base en memoria) de las reglas de la app.
import { InMemoryDb } from "../src/adapters/memory/inMemoryDb.js";
import { crearGastoSimplificado } from "../src/services/gastos.js";

let fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (!cond) fail++;
  console.log(`${cond ? "OK " : "XX "} ${label}${extra ? "  " + extra : ""}`);
}

async function seed() {
  const db = new InMemoryDb();
  // categorias
  const mk = (codigo: string, nombre: string) =>
    db.categoria.create({ data: { codigo, nombre, taxItemGroup: "EXENTO", empresa: "ntc", expenseType: "Expense" } });
  const kmCat = await mk("KILOMETRAJE", "Kilometraje");
  const combCat = await mk("COMBUSTIBLE", "Combustible");
  const antCat = await mk("Anticipo_Empleados", "Anticipos a Empleados");
  const almCat = await mk("ALMUERZO_CENA", "Almuerzo/Cena");
  await db.grupoImpuesto.create({ data: { name: "EXENTO" } });
  // tarifas km
  await db.tarifaKm.create({ data: { id: "t_gam", zona: "GAM", montoPorKm: 200, activo: true } });
  await db.tarifaKm.create({ data: { id: "t_giras", zona: "GIRAS", montoPorKm: 0, activo: true } });
  return { db, kmCat, combCat, antCat, almCat };
}

async function nuevaLiq(db: InMemoryDb, proposito: string, moneda = "CRC") {
  const l = await db.liquidacion.create({ data: { proposito, moneda, empresa: "ntc", centroCostoId: null, name: "LIQ" } });
  return String((l as Record<string, unknown>)["id"]);
}

async function main() {
  const { db, kmCat, combCat, antCat, almCat } = await seed();
  const id = (x: unknown) => String((x as Record<string, unknown>)["id"]);
  const base = { fecha: "2026-07-20", comerciante: "Test", situacionFiscal: "EXENTO" as const };

  // 1) KILOMETRAJE con tarifa GAM=200, km=10 -> monto 2000, metodo FONDO_PERS
  let liq = await nuevaLiq(db, "KILOMETRAJE");
  let r = await crearGastoSimplificado(db, liq, { ...base, monto: 9999, categoriaId: id(kmCat), zona: "GAM", kilometros: 10, tipoComprobante: "KILOMETRAJE" });
  let g = r.gastoId ? (await db.gasto.findUnique({ where: { id: r.gastoId } })) as Record<string, unknown> : null;
  check("KM GAM: creado", r.ok, JSON.stringify(r.error ?? ""));
  check("KM GAM: monto = km*tarifa (10*200=2000)", Number(g?.["montoTotal"]) === 2000, `-> ${g?.["montoTotal"]}`);
  check("KM GAM: metodo FONDO_PERS", g?.["metodoPago"] === "FONDO_PERS", `-> ${g?.["metodoPago"]}`);
  check("KM GAM: zona/km guardados", g?.["zona"] === "GAM" && Number(g?.["kilometros"]) === 10);

  // 2) KILOMETRAJE con tarifa GIRAS=0 -> usa monto manual (fallback)
  liq = await nuevaLiq(db, "KILOMETRAJE");
  r = await crearGastoSimplificado(db, liq, { ...base, monto: 5000, categoriaId: id(kmCat), zona: "GIRAS", kilometros: 10, tipoComprobante: "KILOMETRAJE" });
  g = r.gastoId ? (await db.gasto.findUnique({ where: { id: r.gastoId } })) as Record<string, unknown> : null;
  check("KM GIRAS (tarifa 0): usa monto manual 5000", Number(g?.["montoTotal"]) === 5000, `-> ${g?.["montoTotal"]}`);

  // 3) ANTICIPOS: solo Anticipo_Empleados, un solo gasto
  liq = await nuevaLiq(db, "ANTICIPOS");
  r = await crearGastoSimplificado(db, liq, { ...base, monto: 30000, categoriaId: id(antCat) });
  check("ANTICIPOS: primer gasto OK", r.ok, JSON.stringify(r.error ?? ""));
  const r2 = await crearGastoSimplificado(db, liq, { ...base, monto: 10000, categoriaId: id(antCat) });
  check("ANTICIPOS: segundo gasto BLOQUEADO", !r2.ok && /único|unico/i.test(r2.error ?? ""), `-> ${r2.error}`);
  const r3 = await crearGastoSimplificado(db, await nuevaLiq(db, "ANTICIPOS"), { ...base, monto: 5000, categoriaId: id(almCat) });
  check("ANTICIPOS: categoria invalida RECHAZADA", !r3.ok && /no es v/i.test(r3.error ?? ""), `-> ${r3.error}`);

  // 4) CAJA CHICA TESORERIA -> metodo CAJA_TESOR, cualquier categoria
  liq = await nuevaLiq(db, "CAJA_CHICA_TESORERIA");
  r = await crearGastoSimplificado(db, liq, { ...base, monto: 8000, categoriaId: id(almCat) });
  g = r.gastoId ? (await db.gasto.findUnique({ where: { id: r.gastoId } })) as Record<string, unknown> : null;
  check("CAJA TESORERIA: metodo CAJA_TESOR", g?.["metodoPago"] === "CAJA_TESOR", `-> ${g?.["metodoPago"]}`);

  // 5) KILOMETRAJE con COMBUSTIBLE + litros/tipo -> metodo FONDO_PERS, sin km calc (monto manual)
  liq = await nuevaLiq(db, "KILOMETRAJE");
  r = await crearGastoSimplificado(db, liq, { ...base, monto: 15000, categoriaId: id(combCat), litros: 12.5, tipoGasolina: "DIESEL" });
  g = r.gastoId ? (await db.gasto.findUnique({ where: { id: r.gastoId } })) as Record<string, unknown> : null;
  check("COMBUSTIBLE en KM: creado con litros/tipo", r.ok && Number(g?.["litros"]) === 12.5 && g?.["tipoGasolina"] === "DIESEL", JSON.stringify(r.error ?? ""));
  check("COMBUSTIBLE en KM: monto manual 15000 (sin km)", Number(g?.["montoTotal"]) === 15000, `-> ${g?.["montoTotal"]}`);

  console.log(fail === 0 ? "\n>>> TODO OK" : `\n>>> ${fail} FALLARON`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
