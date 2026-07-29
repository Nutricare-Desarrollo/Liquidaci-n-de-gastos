-- Item 12: version del informe FO para el re-posteo (nuevo ExternalId por version).
ALTER TABLE "Liquidacion" ADD COLUMN "versionFO" INTEGER NOT NULL DEFAULT 1;
