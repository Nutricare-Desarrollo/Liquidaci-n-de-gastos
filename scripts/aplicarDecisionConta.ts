// Aplica las decisiones de Conta (Excel): activa/desactiva categorias y centros.
//   npx tsx --env-file=.env scripts/aplicarDecisionConta.ts
import { getDb } from "../src/db/client.js";

const CATS_DESACTIVAR = [
  "ALMUERZO","CENA","COMBUSTIBLE","DEV_ANTICI","GASTO_NO_DEDUCI","GPS","INVENTARIO",
  "MARCHAMO","OBRAS_PROCESO","OTROS-KIL","SEGURIDAD","SERVICIO_SALUD","SUMINISTROS","TAC",
];
const CATS_ACTIVAR = ["CXC_VARIAS","MULTA_SANCION"];
const CENTROS_DESACTIVAR = ["200103"]; // Cuidado Cronico

async function setCatActivo(db: ReturnType<typeof getDb>, codigo: string, activo: boolean) {
  const cats = (await db.categoria.findMany({ where: { codigo } })) as Array<Record<string, unknown>>;
  for (const c of cats) await db.categoria.update({ where: { id: String(c["id"]) }, data: { activo } });
  return cats.length;
}

async function main() {
  const db = getDb();
  let d = 0, a = 0;
  for (const cod of CATS_DESACTIVAR) { const n = await setCatActivo(db, cod, false); d += n; console.log(`cat OFF: ${cod} (${n})`); }
  for (const cod of CATS_ACTIVAR)    { const n = await setCatActivo(db, cod, true);  a += n; console.log(`cat ON : ${cod} (${n})`); }
  let c = 0;
  for (const num of CENTROS_DESACTIVAR) {
    const cs = (await db.centroCosto.findMany({ where: { operatingUnitNumber: num } })) as Array<Record<string, unknown>>;
    for (const x of cs) await db.centroCosto.update({ where: { id: String(x["id"]) }, data: { activo: false } });
    c += cs.length; console.log(`centro OFF: ${num} (${cs.length})`);
  }
  console.log(`\nCategorias: ${d} desactivadas, ${a} activadas. Centros: ${c} desactivados.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
