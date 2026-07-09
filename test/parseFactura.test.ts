import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFactura } from "../src/domain/parseFactura.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf-8");

// Valores tomados de los 4 XML reales entregados por Nutricare.
const CASOS = [
  {
    file: "f1_jsm_nosujeto.xml",
    clave: "50601062600310108048000200001010000015226182588846",
    consecutivo: "00200001010000015226",
    total: 38019,
    situacion: "NO SUJETO",
    moneda: "CRC",
    emisor: "CORPORACION INTERNACIONAL CESPEDES  S.A.",
    receptor: "3101179050",
    cantidad: 51.868,
    detalle: "GASOLINA SUPER",
  },
  {
    file: "f2_avenida9_exento.xml",
    clave: "50629062600310174393600100001010000196897100000001",
    consecutivo: "00100001010000196897",
    total: 44642,
    situacion: "EXENTO",
    moneda: "CRC",
    emisor: "SERVICENTRO AVENIDA NUEVE SOCIEDAD ANONIMA",
    receptor: "3101179050",
    cantidad: 59.286,
    detalle: "SUPER GASOLINA",
  },
  {
    file: "f3_toledo_diesel_nosujeto.xml",
    clave: "50630062600310274467400100001010000183211178712353",
    consecutivo: "00100001010000183211",
    total: 56159,
    situacion: "NO SUJETO",
    moneda: "CRC",
    emisor: "SERVICENTRO TOLEDO LIMITADA",
    receptor: "3101179050",
    cantidad: 83.819,
    detalle: "Diesel - 815595",
  },
  {
    file: "f4_discom_exento.xml",
    clave: "50628062600310188852001300001010000995288101305288",
    consecutivo: "01300001010000995288",
    total: 35144,
    situacion: "EXENTO",
    moneda: "CRC",
    emisor: "DISCOM COSTA RICA CORP SOCIEDAD ANONIMA",
    receptor: "3101179050",
    cantidad: 46.672,
    detalle: "GASOLINA SUPER",
  },
] as const;

describe("parseFactura contra XML reales", () => {
  for (const c of CASOS) {
    it(`${c.file}: campos financieros del XML`, () => {
      const f = parseFactura(fx(c.file));
      expect(f.clave).toBe(c.clave);
      expect(f.consecutivo).toBe(c.consecutivo);
      expect(f.totalComprobante).toBe(c.total);
      expect(f.situacionFiscal).toBe(c.situacion);
      expect(f.moneda).toBe(c.moneda);
      expect(f.emisorNombre).toBe(c.emisor);
      expect(f.receptorIdentificacion).toBe(c.receptor);
      expect(f.cantidad).toBeCloseTo(c.cantidad, 3);
      expect(f.detalle).toBe(c.detalle);
    });
  }

  it("clave siempre son 50 digitos", () => {
    for (const c of CASOS) {
      const f = parseFactura(fx(c.file));
      expect(f.clave).toMatch(/^\d{50}$/);
    }
  });

  it("ignora la respuesta de Hacienda (sin total)", () => {
    const respuesta = `<?xml version="1.0"?>
      <MensajeHacienda xmlns="x"><Clave>50601062600310108048000200001010000015226182588846</Clave>
      <Mensaje>1</Mensaje></MensajeHacienda>`;
    expect(() => parseFactura(respuesta)).toThrowError();
  });
});
