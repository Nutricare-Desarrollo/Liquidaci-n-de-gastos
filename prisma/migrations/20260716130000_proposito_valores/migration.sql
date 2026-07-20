-- Nuevos propositos (revision Contabilidad jul-2026): caja chica dividida,
-- liquidacion de anticipos, anticipos y kilometraje.
ALTER TYPE "Proposito" ADD VALUE IF NOT EXISTS 'CAJA_CHICA_TESORERIA';
ALTER TYPE "Proposito" ADD VALUE IF NOT EXISTS 'CAJA_CHICA_ALMACEN';
ALTER TYPE "Proposito" ADD VALUE IF NOT EXISTS 'LIQUIDACION_ANTICIPOS';
ALTER TYPE "Proposito" ADD VALUE IF NOT EXISTS 'ANTICIPOS';
ALTER TYPE "Proposito" ADD VALUE IF NOT EXISTS 'KILOMETRAJE';
