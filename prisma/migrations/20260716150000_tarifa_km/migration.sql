-- Tarifa por km para KILOMETRAJE (monto = km * tarifa por zona).
CREATE TABLE "TarifaKm" (
    "id" TEXT NOT NULL,
    "zona" TEXT NOT NULL,
    "montoPorKm" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TarifaKm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TarifaKm_zona_key" ON "TarifaKm"("zona");
INSERT INTO "TarifaKm" ("id","zona","montoPorKm","activo") VALUES
  ('tarifa_gam','GAM',0,true),
  ('tarifa_giras','GIRAS',0,true);
