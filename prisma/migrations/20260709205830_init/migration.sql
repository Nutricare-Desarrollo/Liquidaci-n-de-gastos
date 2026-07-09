-- CreateEnum
CREATE TYPE "Empresa" AS ENUM ('ntc', 'feh');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('CRC', 'USD', 'Otra');

-- CreateEnum
CREATE TYPE "SituacionFiscal" AS ENUM ('IVA', 'EXENTO', 'NO_SUJETO', 'SIN_DEFINIR');

-- CreateEnum
CREATE TYPE "Proposito" AS ENUM ('CAJA_CHICA', 'FONDOS_PERSONALES', 'TARJETA_CORPORATIVA');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA_ELECTRONICA', 'REGIMEN_SIMPLIFICADO');

-- CreateEnum
CREATE TYPE "TipoGasolina" AS ENUM ('GASOLINA', 'DIESEL', 'GAS_LP');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'ENVIADA', 'EN_REVISION_CONTA', 'APROBADA', 'POSTEADA', 'DEVUELTA', 'ERROR_POSTEO');

-- CreateEnum
CREATE TYPE "EstadoCaptura" AS ENUM ('PENDIENTE_OCR', 'PENDIENTE_CRUCE', 'CRUZADA');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('SIN_CAPTURA', 'CRUZADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "personnelNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Captura" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagenUrl" TEXT,
    "contenidoOcr" TEXT,
    "clave" TEXT,
    "confianza" DOUBLE PRECISION,
    "correoEmpleado" TEXT NOT NULL,
    "empleadoId" TEXT,
    "categoriaId" TEXT,
    "liquidacionId" TEXT,
    "estado" "EstadoCaptura" NOT NULL DEFAULT 'PENDIENTE_OCR',
    "facturaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Captura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "consecutivo" TEXT,
    "fechaEmision" TIMESTAMP(3),
    "emisorNombre" TEXT,
    "emisorIdentificacion" TEXT,
    "receptorIdentificacion" TEXT,
    "esDeLaEmpresa" BOOLEAN NOT NULL DEFAULT false,
    "totalComprobante" DECIMAL(18,5) NOT NULL,
    "totalImpuesto" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "totalGravado" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "totalExento" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "totalNoSujeto" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "moneda" "Moneda" NOT NULL DEFAULT 'CRC',
    "situacionFiscal" "SituacionFiscal" NOT NULL DEFAULT 'SIN_DEFINIR',
    "cantidad" DECIMAL(18,5),
    "detalle" TEXT,
    "urlPdf" TEXT,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'SIN_CAPTURA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "correoEmpleado" TEXT NOT NULL,
    "empresa" "Empresa" NOT NULL,
    "proposito" "Proposito" NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "centroCostoId" TEXT,
    "aprobadorId" TEXT,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "montoInforme" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "numeroReporteFO" TEXT,
    "comentarioAprobacion" TEXT,
    "comentarioConta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "facturaId" TEXT,
    "capturaId" TEXT,
    "montoTotal" DECIMAL(18,5) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "comerciante" TEXT,
    "centroCostoId" TEXT,
    "metodoPago" TEXT NOT NULL,
    "situacionFiscal" "SituacionFiscal" NOT NULL,
    "grupoImpuesto" TEXT NOT NULL,
    "tipoComprobante" "TipoComprobante" NOT NULL DEFAULT 'FACTURA_ELECTRONICA',
    "litros" DECIMAL(18,5),
    "tipoGasolina" "TipoGasolina",
    "excedeLimite" BOOLEAN NOT NULL DEFAULT false,
    "informacionAdicional" TEXT,
    "alerta" TEXT,
    "urlPdf" TEXT,
    "adjuntos" JSONB,
    "gastoOrigenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "taxItemGroup" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "cuentaContable" TEXT,
    "empresa" "Empresa" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCosto" (
    "id" TEXT NOT NULL,
    "operatingUnitNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CentroCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoImpuesto" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "GrupoImpuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaMonto" (
    "id" TEXT NOT NULL,
    "categoriaCodigo" TEXT NOT NULL,
    "montoMaxCRC" DECIMAL(18,5) NOT NULL,
    "montoMaxUSD" DECIMAL(18,5) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReglaMonto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "actorEmail" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_personnelNumber_key" ON "Usuario"("personnelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Captura_name_key" ON "Captura"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_clave_key" ON "Factura"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_name_key" ON "Liquidacion"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Gasto_name_key" ON "Gasto"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_codigo_empresa_key" ON "Categoria"("codigo", "empresa");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCosto_operatingUnitNumber_key" ON "CentroCosto"("operatingUnitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoImpuesto_name_key" ON "GrupoImpuesto"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaMonto_categoriaCodigo_key" ON "ReglaMonto"("categoriaCodigo");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "Captura" ADD CONSTRAINT "Captura_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Captura" ADD CONSTRAINT "Captura_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Captura" ADD CONSTRAINT "Captura_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Captura" ADD CONSTRAINT "Captura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_aprobadorId_fkey" FOREIGN KEY ("aprobadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_centroCostoId_fkey" FOREIGN KEY ("centroCostoId") REFERENCES "CentroCosto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_gastoOrigenId_fkey" FOREIGN KEY ("gastoOrigenId") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
