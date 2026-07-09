import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFactura } from "../src/domain/parseFactura.js";
import { construirGasto } from "../src/domain/construirGasto.js";
import { TipoGasolina, type Categoria } from "../src/domain/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf-8");

const catCombustible: Categoria = {
  codigo: "COMBUSTIBLES",
  nombre: "Combustibles",
  taxItemGroup: "EXENTO",
  expenseType: "Expense",
  empresa: "ntc",
  activo: true,
};

describe("construirGasto (cruce + herencia + calculos)", () => {
  it("factura Diesel real -> gasto completo y valido", () => {
    const factura = parseFactura(fx("f3_toledo_diesel_nosujeto.xml"));
    const g = construirGasto({
      factura,
      liquidacion: { proposito: "TARJETA CORPORATIVA", moneda: "CRC", centroCostoId: "cc1" },
      categoria: { ...catCombustible, taxItemGroup: "NO SUJETO" },
      gruposImpuestoDisponibles: ["IVA 13%", "EXENTO", "NO SUJETO"],
      reglas: [],
    });
    expect(g.montoTotal).toBe(56159); // del XML, no del OCR
    expect(g.metodoPago).toBe("TARJET_COR");
    expect(g.situacionFiscal).toBe("NO SUJETO");
    expect(g.tipoGasolina).toBe(TipoGasolina.Diesel);
    expect(g.litros).toBeCloseTo(83.819, 3);
    expect(g.grupoImpuestoExisteEnCatalogo).toBe(true);
    expect(g.errores).toEqual([]); // combustible con litros y tipo
  });

  it("almuerzo que excede tope marca alerta y exige justificacion", () => {
    const factura = parseFactura(fx("f1_jsm_nosujeto.xml")); // total 38019
    const g = construirGasto({
      factura,
      liquidacion: { proposito: "CAJA CHICA", moneda: "CRC", centroCostoId: null },
      categoria: {
        codigo: "ALMUERZO",
        nombre: "Almuerzo",
        taxItemGroup: "IVA 13%",
        expenseType: "Meals",
        empresa: "ntc",
        activo: true,
      },
      gruposImpuestoDisponibles: ["IVA 13%"],
      reglas: [{ categoriaCodigo: "ALMUERZO", montoMaxCRC: 10000, montoMaxUSD: 20, activo: true }],
    });
    expect(g.excedeLimite).toBe(true);
    expect(g.alerta).toContain("Excede");
    expect(g.metodoPago).toBe("CAJA CHICA");
    expect(g.errores.some((e) => e.includes("informacion adicional"))).toBe(true);
  });
});
