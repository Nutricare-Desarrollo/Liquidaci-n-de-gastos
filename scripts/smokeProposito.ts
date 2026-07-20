// Smoke test de las reglas por proposito (sin DB). Correr: npx tsx scripts/smokeProposito.ts
import { metodoPago } from "../src/domain/metodoPago.js";
import {
  propositoDeClave, categoriasPermitidas, categoriaEsValida,
  permiteUnSoloGasto, requiereKilometraje,
} from "../src/domain/proposito.js";
import type { Moneda } from "../src/domain/types.js";

let fail = 0;
function eq(label: string, got: unknown, exp: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) fail++;
  console.log(`${ok ? "OK " : "XX "} ${label}  ->  ${JSON.stringify(got)}${ok ? "" : "  (esperaba " + JSON.stringify(exp) + ")"}`);
}

console.log("== metodo de pago por proposito ==");
const M: Array<[string, Moneda, string]> = [
  ["TARJETA_CORPORATIVA", "CRC", "TARJET_COR"],
  ["TARJETA_CORPORATIVA", "USD", "TARJET_DOL"],
  ["FONDOS_PERSONALES", "CRC", "FONDO_PERS"],
  ["CAJA_CHICA_TESORERIA", "CRC", "CAJA_TESOR"],
  ["CAJA_CHICA_ALMACEN", "CRC", "CAJA_ALMAC"],
  ["LIQUIDACION_ANTICIPOS", "CRC", "DEV-ANTICI"],
  ["ANTICIPOS", "CRC", "FONDO_PERS"],
  ["KILOMETRAJE", "CRC", "FONDO_PERS"],
];
for (const [clave, mon, exp] of M) eq(`${clave}/${mon}`, metodoPago(propositoDeClave(clave), mon), exp);

console.log("\n== categorias permitidas ==");
eq("ANTICIPOS -> solo Anticipo_Empleados", categoriasPermitidas(propositoDeClave("ANTICIPOS")), ["Anticipo_Empleados"]);
eq("KILOMETRAJE -> KM/COMBUSTIBLE(S)", categoriasPermitidas(propositoDeClave("KILOMETRAJE")), ["KILOMETRAJE", "COMBUSTIBLE", "COMBUSTIBLES"]);
eq("TARJETA -> todas (null)", categoriasPermitidas(propositoDeClave("TARJETA_CORPORATIVA")), null);
eq("ANTICIPOS acepta Anticipo_Empleados", categoriaEsValida(propositoDeClave("ANTICIPOS"), "Anticipo_Empleados"), true);
eq("ANTICIPOS rechaza ALMUERZO_CENA", categoriaEsValida(propositoDeClave("ANTICIPOS"), "ALMUERZO_CENA"), false);
eq("KILOMETRAJE acepta COMBUSTIBLE", categoriaEsValida(propositoDeClave("KILOMETRAJE"), "COMBUSTIBLE"), true);
eq("KILOMETRAJE rechaza ALQUILER", categoriaEsValida(propositoDeClave("KILOMETRAJE"), "ALQUILER"), false);
eq("CAJA_CHICA_TESORERIA acepta cualquiera", categoriaEsValida(propositoDeClave("CAJA_CHICA_TESORERIA"), "ALQUILER"), true);

console.log("\n== reglas especiales ==");
eq("ANTICIPOS un solo gasto", permiteUnSoloGasto(propositoDeClave("ANTICIPOS")), true);
eq("TARJETA multiples gastos", permiteUnSoloGasto(propositoDeClave("TARJETA_CORPORATIVA")), false);
eq("KILOMETRAJE requiere zona/km", requiereKilometraje(propositoDeClave("KILOMETRAJE")), true);
eq("ANTICIPOS no requiere km", requiereKilometraje(propositoDeClave("ANTICIPOS")), false);

console.log(fail === 0 ? "\n>>> TODO OK" : `\n>>> ${fail} FALLARON`);
process.exit(fail === 0 ? 0 : 1);
