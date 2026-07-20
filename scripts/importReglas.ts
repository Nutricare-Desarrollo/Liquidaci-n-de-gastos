import { getDb } from "../src/db/client.js";

// Reglas reales (monto maximo en CRC). USD queda en 0 (ajustable luego).
const REGLAS: Array<{ categoriaCodigo: string; montoMaxCRC: number }> = [
  { categoriaCodigo: "ALMUERZO_CENA", montoMaxCRC: 6000 },
  { categoriaCodigo: "DESAYUNO", montoMaxCRC: 4200 },
  { categoriaCodigo: "ALMUERZO_GIRA", montoMaxCRC: 6000 },
];

async function main() {
  const db = getDb();
  let creadas = 0, actualizadas = 0;
  for (const r of REGLAS) {
    const data = { categoriaCodigo: r.categoriaCodigo, montoMaxCRC: r.montoMaxCRC, montoMaxUSD: 0, activo: true };
    const existe = (await db.reglaMonto.findFirst({ where: { categoriaCodigo: r.categoriaCodigo } })) as { id: string } | null;
    if (existe) { await db.reglaMonto.update({ where: { id: existe.id }, data }); actualizadas++; }
    else { await db.reglaMonto.create({ data }); creadas++; }
  }
  console.log(`Reglas: ${creadas} nuevas, ${actualizadas} actualizadas.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
