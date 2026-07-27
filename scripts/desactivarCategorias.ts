// Desactiva categorias legacy/no-usar (dejan de aparecer en el selector).
// Editá la lista DESACTIVAR y corré:
//   npx tsx --env-file=.env scripts/desactivarCategorias.ts
import { getDb } from "../src/db/client.js";

// Codigos EXACTOS a desactivar (no toca las buenas: COMBUSTIBLES, ALMUERZO_CENA, SUMINISTRO_COCINA).
const DESACTIVAR = ["COMBUSTIBLE", "ALMUERZO", "SUMINISTROS"];

async function main() {
  const db = getDb();
  let n = 0;
  for (const codigo of DESACTIVAR) {
    const cats = (await db.categoria.findMany({ where: { codigo } })) as Array<Record<string, unknown>>;
    if (cats.length === 0) { console.log(`(no existe en la base: ${codigo})`); continue; }
    for (const c of cats) {
      await db.categoria.update({ where: { id: String(c["id"]) }, data: { activo: false } });
      n++;
      console.log(`desactivada: ${codigo} (${c["empresa"]}) - ${c["nombre"]}`);
    }
  }
  console.log(`\nTotal desactivadas: ${n}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
