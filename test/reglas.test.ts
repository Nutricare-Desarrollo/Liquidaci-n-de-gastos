import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFactura } from "../src/domain/parseFactura.js";
import { detectarCombustible, CATEGORIA_COMBUSTIBLE } from "../src/domain/combustible.js";
import { TipoGasolina } from "../src/domain/types.js";
import { metodoPago } from "../src/domain/metodoPago.js";
import { situacionFiscal } from "../src/domain/situacionFiscal.js";
import { evaluarLimite } from "../src/domain/reglasMonto.js";
import { cruza } from "../src/domain/cruce.js";
import { desglosarClave, esClaveValida, extraerClaveDeTexto } from "../src/domain/clave.js";
import { validarGasto, validarEnvioInforme } from "../src/domain/validaciones.js";
import { postearInforme } from "../src/services/posteoFO.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf-8");

describe("combustible (heuristica del tipo) sobre detalle real", () => {
  it("Diesel real -> DIESEL", () => {
    const f = parseFactura(fx("f3_toledo_diesel_nosujeto.xml"));
    const c = detectarCombustible(f.cantidad, f.detalle);
    expect(c.tipo).toBe(TipoGasolina.Diesel);
    expect(c.litros).toBeCloseTo(83.819, 3);
  });
  it("GASOLINA SUPER -> GASOLINA", () => {
    const f = parseFactura(fx("f1_jsm_nosujeto.xml"));
    expect(detectarCombustible(f.cantidad, f.detalle).tipo).toBe(TipoGasolina.Gasolina);
  });
  it("SUPER GASOLINA -> GASOLINA", () => {
    const f = parseFactura(fx("f2_avenida9_exento.xml"));
    expect(detectarCombustible(f.cantidad, f.detalle).tipo).toBe(TipoGasolina.Gasolina);
  });
  it("Gas LP -> GAS_LP (Diesel no debe ganar)", () => {
    expect(detectarCombustible(10, "GAS LP RECARGA").tipo).toBe(TipoGasolina.GasLP);
  });
  it("sin match -> null", () => {
    expect(detectarCombustible(10, "ACEITE MOTOR").tipo).toBeNull();
  });
});

describe("situacion fiscal (prioridad)", () => {
  it("IVA gana sobre exento/nosujeto", () => {
    expect(situacionFiscal({ totalImpuesto: 5, totalExento: 9, totalNoSujeto: 9 })).toBe("IVA");
  });
  it("exento antes que no sujeto", () => {
    expect(situacionFiscal({ totalImpuesto: 0, totalExento: 9, totalNoSujeto: 9 })).toBe("EXENTO");
  });
  it("no sujeto", () => {
    expect(situacionFiscal({ totalImpuesto: 0, totalExento: 0, totalNoSujeto: 9 })).toBe("NO SUJETO");
  });
  it("vacio cuando todo es 0", () => {
    expect(situacionFiscal({ totalImpuesto: 0, totalExento: 0, totalNoSujeto: 0 })).toBe("");
  });
});

describe("metodo de pago", () => {
  it("caja chica", () => expect(metodoPago("CAJA CHICA - TESORERÍA", "CRC")).toBe("CAJA_TESOR"));
  it("fondos personales", () =>
    expect(metodoPago("PAGO CON FONDOS PERSONALES", "USD")).toBe("FONDOS_PERS"));
  it("tarjeta corporativa colones", () =>
    expect(metodoPago("TARJETA CORPORATIVA", "CRC")).toBe("TARJET_COR"));
  it("tarjeta corporativa dolares", () =>
    expect(metodoPago("TARJETA CORPORATIVA", "USD")).toBe("TARJET_DOL"));
});

describe("reglas de monto (exceso)", () => {
  const reglas = [
    { categoriaCodigo: "ALMUERZO", montoMaxCRC: 10000, montoMaxUSD: 20, activo: true },
  ];
  it("excede en CRC exige justificacion", () => {
    const r = evaluarLimite({ categoriaCodigo: "ALMUERZO", monto: 15000, monedaInforme: "CRC", reglas });
    expect(r.excede).toBe(true);
    expect(r.alerta).toContain("Excede");
  });
  it("no excede", () => {
    const r = evaluarLimite({ categoriaCodigo: "ALMUERZO", monto: 8000, monedaInforme: "CRC", reglas });
    expect(r.excede).toBe(false);
  });
  it("categoria sin regla nunca excede", () => {
    const r = evaluarLimite({ categoriaCodigo: "COMBUSTIBLES", monto: 999999, monedaInforme: "CRC", reglas });
    expect(r.excede).toBe(false);
  });
  it("usa el tope de la moneda del informe (sin conversiones)", () => {
    const r = evaluarLimite({ categoriaCodigo: "ALMUERZO", monto: 25, monedaInforme: "USD", reglas });
    expect(r.excede).toBe(true);
    expect(r.topeAplicado).toBe(20);
  });
});

describe("cruce foto <-> factura", () => {
  const clave = "50630062600310274467400100001010000183211178712353";
  it("empareja aunque el OCR traiga espacios y saltos", () => {
    const ocr = `FACTURA\nClave: 5063 0062 6003 1027 4467 4001 0000 1010 0001 8321 1178 7123 53\nTotal 56159`;
    expect(cruza(ocr, clave)).toBe(true);
  });
  it("no empareja si la clave no esta", () => {
    expect(cruza("texto sin clave", clave)).toBe(false);
  });
  it("clave vacia no empareja", () => {
    expect(cruza("cualquier cosa", "")).toBe(false);
  });
});

describe("clave 50 digitos", () => {
  const clave = "50601062600310108048000200001010000015226182588846";
  it("valida", () => expect(esClaveValida(clave)).toBe(true));
  it("rechaza largo incorrecto", () => expect(esClaveValida("506")).toBe(false));
  it("desglosa segmentos", () => {
    const d = desglosarClave(clave)!;
    expect(d.codigoPais).toBe("506");
    expect(d.tipoDocumento).toBe("01"); // factura electronica
    expect(d.cedulaEmisor).toBe("003101080480"); // 12 digitos desde pos 10 (con ceros)
  });
  it("extrae clave de texto OCR", () => {
    expect(extraerClaveDeTexto(`ruido ${clave} mas ruido`)).toBe(clave);
  });
});

describe("validaciones", () => {
  it("combustible sin litros/tipo bloquea", () => {
    const errs = validarGasto({ categoriaCodigo: CATEGORIA_COMBUSTIBLE, litros: 0, tipoGasolina: null, excedeLimite: false });
    expect(errs.length).toBe(2);
  });
  it("excede sin justificacion bloquea", () => {
    const errs = validarGasto({ categoriaCodigo: "ALMUERZO", excedeLimite: true, informacionAdicional: "" });
    expect(errs).toContain("Excede limite sin informacion adicional (justificacion).");
  });
  it("envio sin aprobador bloquea", () => {
    expect(validarEnvioInforme({ aprobadorId: null }).length).toBe(1);
  });
});

describe("posteo FO: anti-duplicado (pendiente del traspaso)", () => {
  const fakeFinance = {
    crearReporteGasto: async () => ({ success: true, message: "ok", expenseReportNumber: "EXP-1" }),
  };
  const base = {
    id: "LIQ-1",
    empresa: "ntc" as const,
    personnelNumber: "NTC-1",
    purpose: "TARJETA CORPORATIVA",
    descripcion: "d",
    gastos: [{ costType: "COMBUSTIBLES", amount: 100, currency: "CRC" as const, payMethod: "TARJET_COR" as const, transDate: "2026-06-01", description: "d", taxGroup: "EXENTO" as const, taxItemGroup: "EXENTO" }],
  };
  it("postea si no tiene numero FO", async () => {
    const r = await postearInforme({ ...base, numeroReporteFO: null }, fakeFinance);
    expect(r.posteado).toBe(true);
    expect(r.numeroReporteFO).toBe("EXP-1");
  });
  it("NO re-postea si ya tiene numero FO", async () => {
    const r = await postearInforme({ ...base, numeroReporteFO: "EXP-9" }, fakeFinance);
    expect(r.posteado).toBe(false);
    expect(r.yaEstaba).toBe(true);
  });
});
