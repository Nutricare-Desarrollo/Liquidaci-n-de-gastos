// Lista las categorias del catalogo (base actual). Correr:
//   npx tsx --env-file=.env scripts/listCategorias.ts
import { getDb } from "../src/db/client.js";

async function main() {
  const db = getDb();
  const cats = (await db.categoria.findMany()) as Array<Record<string, unknown>>;
  const orden = cats.sort((a, b) =>
    (String(a["empresa"]) + String(a["codigo"])).localeCompare(String(b["empresa"]) + String(b["codigo"])));
  console.log(`Total: ${cats.length}\n`);
  console.log(`${"empresa".padEnd(8)} ${"activo".padEnd(7)} ${"codigo".padEnd(22)} nombre`);
  console.log("-".repeat(80));
  for (const c of orden) {
    console.log(`${String(c["empresa"]).padEnd(8)} ${(c["activo"] ? "SI" : "no").padEnd(7)} ${String(c["codigo"]).padEnd(22)} ${String(c["nombre"] ?? "")}`);
  }
  const activas = cats.filter((c) => c["activo"]).length;
  console.log(`\nActivas (aparecen en el selector): ${activas} | Inactivas: ${cats.length - activas}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
