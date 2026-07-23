# Handoff — Módulo de Liquidación de Gastos (para integrar en el ERP propio)

Documento para llevar a otro contexto/chat. Resume QUÉ es el módulo, su
arquitectura y DÓNDE se engancha con un ERP. La lógica de negocio no cambia;
integrar en otro ERP = reemplazar un adaptador (FinancePort) + fuentes de datos.

## 1. Qué hace el módulo
Captura de comprobantes (móvil), cruce con factura electrónica (XML de Hacienda CR)
u OCR, armado de "liquidaciones" (informes) con N "gastos", validaciones, flujo de
aprobación (2 etapas: aprobador → contabilidad) y posteo del informe al ERP contable.

Reglas de negocio clave (todo esto se reutiliza igual):
- **Propósito → método de pago + categorías**: TARJETA CORPORATIVA, PAGO CON FONDOS
  PERSONALES, CAJA CHICA (Tesorería/Almacén), LIQUIDACIÓN ANTICIPOS, ANTICIPOS, KILOMETRAJE.
- **Anticipos**: un único gasto por liquidación, solo categoría de anticipos.
- **Kilometraje**: monto = km × tarifa por zona (GAM/GIRAS), campos zona + km.
- **Combustible**: exige litros + tipo.
- **Tipo de cambio**: CRC 1:1; USD por fecha (lo calcula el destino contable).
- **Dimensiones financieras** derivadas del código de centro de costo:
  A (departamento)=primeros 2 dígitos, B (unidad de negocio)=primeros 4, C=código completo.
- **Reglas de monto** (topes por categoría) y alertas de exceso.

## 2. Stack técnico
- Backend: Node 20+ / TypeScript (ESM), Fastify, Prisma ORM.
- Base: PostgreSQL.
- Frontend: Vite + React (TS).
- Arquitectura **hexagonal**: dominio puro + PUERTOS (interfaces) + ADAPTADORES.

## 3. Puertos (interfaces) = puntos de integración
Están en `src/ports/index.ts`. Para otro ERP normalmente solo se cambian los adaptadores:

- **FinancePort** ← EL PRINCIPAL. Postea el informe al sistema contable.
  Hoy: `FoHttpClient` (llama a un servicio X++ de Dynamics FO).
  Para el ERP propio: crear `ErpFinanceClient implements FinancePort`.
- **UsuariosPort**: directorio de empleados/aprobadores (hoy: Entra/Graph).
- **AuthPort**: valida el token del usuario (hoy: Entra JWT).
- **StoragePort**: guarda adjuntos/PDF (hoy: SharePoint o Blob).
- **NotificacionPort**: dispara la aprobación (hoy: Power Automate/Teams).
- **OcrPort**: lee la clave del comprobante (hoy: Azure Document Intelligence).

La selección de adaptador real vs fake está en `src/deps.ts` (según variables de entorno).

## 4. Contrato que el módulo envía al sistema contable (FinancePort)
Esto es lo que el ERP debe poder recibir para registrar el informe (ver
`src/ports/index.ts` → `ReporteGastoFO` / `LineaReporteFO`):

Cabecera:
- company (empresa), personnelNumber (empleado), purpose (propósito),
  description, externalId (id de la liquidación, para idempotencia/anti-duplicado).

Líneas (una por gasto):
- costType (categoría), amount, currency, payMethod, transDate, description,
  taxGroup (grupo de venta), taxItemGroup (grupo de artículos), receiptNumber
  (nº factura), merchant (comerciante), zone + km (kilometraje),
  costCenter (C) + departamento (A) + unidadNegocio (B) (dimensiones).

El ERP debe: crear el informe + líneas, asignar dimensiones A/B/C, devolver un
número de informe y (idealmente) evitar duplicados por externalId.

## 5. Datos maestros (imports) — adaptar a las fuentes del ERP
Scripts en `scripts/` que hoy jalan de Dynamics/Entra; se re-apuntan al ERP:
- Categorías de gasto, Centros de costo (con A/B derivadas), Empleados,
  Grupos de impuesto, Reglas de monto, Tarifas por km.

## 6. Configuración (variables de entorno) — ver `src/config.ts`
DATABASE_URL; credenciales del sistema contable (URL/scope/credenciales);
almacenamiento (blob/sharepoint); OCR; buzón de facturación; notificación
(URL del flujo + secreto); AUTH (habilitar, tenant, audiencia, roles).

## 7. Para integrar en el ERP propio, hace falta definir:
1. **Cómo recibe el ERP un informe de gastos** (API REST/SOAP o inserción en BD):
   endpoint, método, autenticación y un ejemplo de payload.
2. **Modelo de datos contable** del ERP: informe + líneas, campos obligatorios,
   cómo maneja dimensiones/centros de costo, impuestos, monedas y tipo de cambio.
3. **Datos maestros**: cómo obtener categorías, centros de costo, empleados,
   grupos de impuesto (para los imports).
4. **Aprobaciones**: si las maneja el ERP o se sigue con el flujo actual.
5. **Usuarios/roles**: el mismo login (Entra) o el login propio del ERP.

## 8. Trabajo estimado (reusando la app)
- Nuevo adaptador `ErpFinanceClient` (implementa FinancePort) → el 80% del esfuerzo.
- Re-apuntar los scripts de datos maestros a las fuentes del ERP.
- Ajustar `AuthPort`/`UsuariosPort` si el ERP tiene login propio.
- Config/env hacia el ERP.
El dominio (propósitos, dimensiones, kilometraje, cruce, reglas) queda intacto.
