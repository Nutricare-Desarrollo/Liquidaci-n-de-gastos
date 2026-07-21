// =====================================================================
//  Asegura la categoria 'Anticipo_Empleados' en el catalogo (ntc y feh).
//  No vino en el pull de OData; la agregamos para el proposito ANTICIPOS.
//  Correr:  npx tsx --env-file=.env scripts/seedCategoriaAnticipo.ts
// =====================================================================
import { getDb } from "../src/db/client.js";

const CAT = { codigo: "Anticipo_Empleados", nombre: "Anticipos a Empleados", taxItemGroup: "", expenseType: "Advance" };

async function main() {
  const db = getDb();
  for (const empresa of ["ntc", "feh"]) {
    const data = { ...CAT, empresa, activo: true };
    const ex = (await db.categoria.findFirst({ where: { codigo: CAT.codigo, empresa } })) as { id: string } | null;
    if (ex) { await db.categoria.update({ where: { id: ex.id }, data }); console.log(`actualizada (${empresa})`); }
    else { await db.categoria.create({ data }); console.log(`creada (${empresa})`); }
  }
  console.log("Categoria Anticipo_Empleados asegurada.");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
