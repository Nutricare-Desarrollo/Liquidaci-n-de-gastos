import { CATEGORIA_COMBUSTIBLE } from "./combustible.js";
import { TipoGasolina } from "./types.js";

// Validaciones al guardar/enviar (traspaso 4.8). Se corren en front y back.
export interface GastoValidable {
  categoriaCodigo: string;
  litros?: number | null;
  tipoGasolina?: TipoGasolina | null;
  excedeLimite: boolean;
  informacionAdicional?: string | null;
  // En divisiones y regimen simplificado no se exigen litros/tipo (el dato
  // de combustible vive en el gasto original / no aplica sin factura).
  omitirCombustible?: boolean;
  // Obligatorios (nº factura + adjunto). Solo se exigen al enviar el informe.
  exigirObligatorios?: boolean;
  proposito?: string | null;
  tieneAdjunto?: boolean;
  numeroFactura?: string | null;
}

export function validarGasto(g: GastoValidable): string[] {
  const errores: string[] = [];

  if (g.categoriaCodigo === CATEGORIA_COMBUSTIBLE && !g.omitirCombustible) {
    if (!g.litros || g.litros <= 0) errores.push("Combustible sin litros.");
    if (g.tipoGasolina === null || g.tipoGasolina === undefined)
      errores.push("Combustible sin tipo de gasolina.");
  }

  if (g.excedeLimite && !(g.informacionAdicional ?? "").trim()) {
    errores.push("Excede limite sin informacion adicional (justificacion).");
  }

  // Nº de factura + adjunto: obligatorios en todas las categorias, EXCEPTO:
  //  - Anticipos: ninguno obligatorio.
  //  - Kilometraje: solo el adjunto (no lleva nº de factura).
  if (g.exigirObligatorios) {
    const esAnticipo = g.proposito === "ANTICIPOS" || g.categoriaCodigo === "Anticipo_Empleados";
    const esKilometraje = g.proposito === "KILOMETRAJE";
    if (!esAnticipo) {
      if (!g.tieneAdjunto) errores.push("Falta el adjunto (comprobante) del gasto.");
      if (!esKilometraje && !(g.numeroFactura ?? "").trim())
        errores.push("Falta el numero de factura del gasto.");
    }
  }

  return errores;
}

export function validarEnvioInforme(informe: { aprobadorId?: string | null }): string[] {
  const errores: string[] = [];
  if (!(informe.aprobadorId ?? "").trim()) errores.push("Informe sin aprobador.");
  return errores;
}
