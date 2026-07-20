-- Kilometraje como tipo de comprobante (gasto manual sin factura, con zona/km).
ALTER TYPE "TipoComprobante" ADD VALUE IF NOT EXISTS 'KILOMETRAJE';
