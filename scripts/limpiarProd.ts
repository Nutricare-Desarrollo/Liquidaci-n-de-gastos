// Limpieza de datos TRANSACCIONALES para arrancar produccion en limpio.
// Borra gastos, capturas, liquidaciones y facturas. NO toca catalogos
// (categorias, centros, grupos, tarifas, reglas) ni la Configuracion.
//
// Correr (apunta a la base del .env, que es la MISMA Neon de produccion):
//   npx tsx --env-file=.env scripts/limpiarProd.ts
//
// OJO: es destructivo e irreversible. Usar solo antes del go-live, con la
// base que va a ser produccion (hoy tiene solo datos de prueba).
import { getDb } from "../src/db/client.js";

async function main() {
  const db = getDb();
  // Orden por claves foraneas: primero las divisiones (hijos), luego el resto
  // de gastos, luego capturas y liquidaciones, y por ultimo las facturas.
  const hijos = await db.gasto.deleteMany({ where: { gastoOrigenId: { not: null } } });
  const gastos = await db.gasto.deleteMany({});
  const capturas = await db.captura.deleteMany({});
  const liquidaciones = await db.liquidacion.deleteMany({});
  const facturas = await db.factura.deleteMany({});

  console.log("=== Limpieza de datos transaccionales ===");
  console.log(`  gastos (divisiones): ${hijos.count}`);
  console.log(`  gastos (resto):      ${gastos.count}`);
  console.log(`  capturas:            ${capturas.count}`);
  console.log(`  liquidaciones:       ${liquidaciones.count}`);
  console.log(`  facturas:            ${facturas.count}`);
  console.log("Catalogos y Configuracion: intactos.");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
