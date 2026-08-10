-- Configuracion editable en runtime (clave/valor JSON).
CREATE TABLE "Configuracion" (
  "clave"     TEXT NOT NULL,
  "valor"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("clave")
);
