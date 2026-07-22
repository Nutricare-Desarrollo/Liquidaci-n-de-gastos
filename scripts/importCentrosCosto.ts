// =====================================================================
//  Importa/actualiza los CENTROS DE COSTO reales (dimension C_CentrodeCosto)
//  desde fo/centros-costo.json  [{ operatingUnitNumber, name }].
//  - Upsert idempotente por operatingUnitNumber.
//  - Limpia los centros de PRUEBA (los que no estan en la lista real y no
//    estan usados por ninguna liquidacion/gasto).
//  Correr:  npx tsx --env-file=.env scripts/importCentrosCosto.ts
// =====================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";

interface CC { operatingUnitNumber: string; name: string; departamento?: string; unidadNegocio?: string; }

async function main() {
  const ruta = fileURLToPath(new URL("../fo/centros-costo.json", import.meta.url));
  const reales = JSON.parse(readFileSync(ruta, "utf8")) as CC[];
  const db = getDb();

  let creados = 0, actualizados = 0;
  const validos = new Set<string>();
  for (const c of reales) {
    const operatingUnitNumber = String(c.operatingUnitNumber).trim();
    if (!operatingUnitNumber) continue;
    validos.add(operatingUnitNumber);
    // Dimensiones derivadas del codigo del centro (confirmado 44/44):
    //   A (departamento)    = primeros 2 digitos
    //   B (unidad de negocio) = primeros 4 digitos
    const departamento  = c.departamento  ?? operatingUnitNumber.slice(0, 2);
    const unidadNegocio = c.unidadNegocio ?? operatingUnitNumber.slice(0, 4);
    const data = { operatingUnitNumber, name: c.name || operatingUnitNumber, departamento, unidadNegocio };
    const ex = (await db.centroCosto.findFirst({ where: { operatingUnitNumber } })) as { id: string } | null;
    if (ex) { await db.centroCosto.update({ where: { id: ex.id }, data }); actualizados++; }
    else { await db.centroCosto.create({ data }); creados++; }
  }

  // Limpieza de centros de prueba: los que no estan en la lista real y no se usan.
  let borrados = 0, conservados = 0;
  const todos = (await db.centroCosto.findMany()) as Array<{ id: string; operatingUnitNumber: string }>;
  for (const cc of todos) {
    if (validos.has(cc.operatingUnitNumber)) continue;
    const usos =
      (await db.liquidacion.count({ where: { centroCostoId: cc.id } })) +
      (await db.gasto.count({ where: { centroCostoId: cc.id } }));
    if (usos === 0) { await db.centroCosto.deleteMany({ where: { id: cc.id } }); borrados++; }
    else conservados++;
  }

  console.log(`Centros de costo: ${creados} nuevos, ${actualizados} actualizados.`);
  console.log(`Limpieza de prueba: ${borrados} borrados, ${conservados} conservados (en uso).`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
