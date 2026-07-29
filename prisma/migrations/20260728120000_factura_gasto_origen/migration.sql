-- Origen del ingreso: XML (factura electronica ingestada) o MANUAL.
-- La factura lo hereda al gasto al cruzar; gastos manuales/regimen = MANUAL.
ALTER TABLE "Factura" ADD COLUMN "origen" TEXT DEFAULT 'XML';
ALTER TABLE "Gasto" ADD COLUMN "origen" TEXT DEFAULT 'MANUAL';
