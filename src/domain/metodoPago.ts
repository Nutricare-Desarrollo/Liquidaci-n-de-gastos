import type { MetodoPago, Moneda, Proposito } from "./types.js";

// Metodo de pago calculado (traspaso 4.4): proposito del informe + moneda.
// Un informe = una sola moneda (regla de negocio), lo que simplifica esto.
export function metodoPago(proposito: Proposito, moneda: Moneda): MetodoPago {
  switch (proposito) {
    case "CAJA CHICA":
      return "CAJA CHICA";
    case "PAGO CON FONDOS PERSONALES":
      return "FONDOS_PERS";
    case "TARJETA CORPORATIVA":
      return moneda === "USD" ? "TARJET_DOL" : "TARJET_COR";
  }
}
