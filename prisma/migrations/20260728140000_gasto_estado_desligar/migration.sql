-- Item 8: estado del gasto (ASOCIADO/LIBRE) + poder desligarlo de la liquidacion.
-- Se permite liquidacionId nulo (gasto libre para reasignar).
CREATE TYPE "EstadoGasto" AS ENUM ('ASOCIADO', 'LIBRE');
ALTER TABLE "Gasto" ADD COLUMN "estadoGasto" "EstadoGasto" NOT NULL DEFAULT 'ASOCIADO';
ALTER TABLE "Gasto" ALTER COLUMN "liquidacionId" DROP NOT NULL;
