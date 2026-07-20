-- KILOMETRAJE: zona (GAM/GIRAS) y kilometros por gasto.
ALTER TABLE "Gasto" ADD COLUMN "zona" TEXT;
ALTER TABLE "Gasto" ADD COLUMN "kilometros" DECIMAL(18,5);
