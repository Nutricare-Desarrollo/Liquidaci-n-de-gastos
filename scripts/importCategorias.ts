// =====================================================================
//  Importa/actualiza el catalogo de categorias desde el OData de FO.
//  1) Guarda el JSON del OData (ExpenseCategories) en:
//        fo/expense-categories-raw.json
//     URL sugerida (cross-company, ambas empresas):
//     {FO}/data/ExpenseCategories?cross-company=true&$select=dataAreaId,ExpenseCategory,Description,TaxItemGroup,ExpenseType,DefaultPaymentMethod&$top=500
//  2) Corre:  npx tsx scripts/importCategorias.ts
//
//  Upsert idempotente por (codigo, empresa). No borra nada; solo agrega/actualiza.
// =====================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";

interface FoCat {
  dataAreaId: string;
  ExpenseCategory: string;
  Description?: string;
  TaxItemGroup?: string;
  ExpenseType?: string;
  DefaultPaymentMethod?: string;
}

// Categorias internas de FO que NO deberia elegir un empleado (se importan
// inactivas para que existan en el mapeo pero no aparezcan en el selector).
const INACTIVAS = new Set([
  "DEV_ANTICI", "EXCEDE", "CXC_VARIAS", "GASTO_NO_DEDUCI", "MULTA_SANCION",
  "INVENTARIO", "OBRAS_PROCESO", "COMBUSTIBLE", // "COMBUSTIBLE" (ntc) dice "No usar"
]);

async function main() {
  const rutaJson = fileURLToPath(new URL("../fo/expense-categories-raw.json", import.meta.url));
  const raw = JSON.parse(readFileSync(rutaJson, "utf8")) as { value: FoCat[] };
  const db = getDb();

  let creadas = 0, actualizadas = 0, inactivadas = 0;
  for (const c of raw.value) {
    const empresa = (c.dataAreaId || "").toLowerCase();      // ntc / feh
    if (empresa !== "ntc" && empresa !== "feh") continue;
    const codigo = c.ExpenseCategory;
    if (!codigo) continue;

    // COMBUSTIBLE es "No usar" solo en ntc; en feh SI es la categoria valida.
    const inactiva = INACTIVAS.has(codigo) && !(codigo === "COMBUSTIBLE" && empresa === "feh");
    if (inactiva) inactivadas++;

    const data = {
      codigo,
      nombre: c.Description || codigo,
      taxItemGroup: c.TaxItemGroup ?? "",
      expenseType: c.ExpenseType || "Expense",
      empresa,
      activo: !inactiva,
    };

    const existente = (await db.categoria.findFirst({ where: { codigo, empresa } })) as { id: string } | null;
    if (existente) {
      await db.categoria.update({ where: { id: existente.id }, data });
      actualizadas++;
    } else {
      await db.categoria.create({ data });
      creadas++;
    }
  }

  console.log(`Categorias importadas: ${creadas} nuevas, ${actualizadas} actualizadas, ${inactivadas} marcadas inactivas.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
