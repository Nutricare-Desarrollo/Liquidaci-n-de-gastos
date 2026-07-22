-- Dimensiones A (Departamento) y B (Unidad de negocio) por centro de costo.
ALTER TABLE "CentroCosto" ADD COLUMN "departamento" TEXT;
ALTER TABLE "CentroCosto" ADD COLUMN "unidadNegocio" TEXT;
