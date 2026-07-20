import type { MetodoPago, Moneda, Proposito } from "./types.js";

// Metodo de pago segun el PROPOSITO del informe (y moneda para tarjeta).
// Un informe = una sola moneda (regla de negocio).
export function metodoPago(proposito: Proposito, moneda: Moneda): MetodoPago {
  switch (proposito) {
    case "TARJETA CORPORATIVA":
      return moneda === "USD" ? "TARJET_DOL" : "TARJET_COR";
    case "PAGO CON FONDOS PERSONALES":
    case "ANTICIPOS":
    case "KILOMETRAJE":
      return "FONDO_PERS";
    case "CAJA CHICA - TESORERÍA":
      return "CAJA_TESOR";
    case "CAJA CHICA - ALMACÉN":
      return "CAJA_ALMAC";
    case "LIQUIDACIÓN ANTICIPOS":
      return "DEV-ANTICI";
  }
}
