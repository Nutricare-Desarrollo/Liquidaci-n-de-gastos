import { getDb } from "../src/db/client.js";
async function main() {
  const db = getDb();
  const rows = (await db.categoria.findMany({ where: { codigo: "EXCEDE" } })) as Array<{ id: string }>;
  for (const r of rows) {
    await db.categoria.update({ where: { id: r.id }, data: { nombre: "Excede", activo: true } });
  }
  console.log(`Actualizadas ${rows.length} categoria(s) EXCEDE -> nombre "Excede".`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
