# Arquitectura — Sistema de Liquidación de Gastos Nutricare (fuera de Power Platform)

Reconstrucción de la solución que hoy vive en Power Platform (Dataverse + Copilot + Power Automate + model-driven app + Teams). Este documento define el stack, la forma del código y el plan por fases. El "qué" y el "por qué" del negocio están en `Traspaso_sistema_liquidacion_Nutricare.md`; acá va el "cómo".

## Principios que no se negocian

El XML de Hacienda es la fuente de verdad financiera: montos, impuestos y fecha salen siempre del XML, nunca del OCR. La foto solo aporta identidad del empleado y la clave de 50 dígitos para el cruce. La integración con D365 FO no se reescribe: sigue siendo el servicio X++ `NTCExpenseReportService`, ahora invocado por API desde el backend nuevo. Un informe tiene una sola moneda (regla de conta que simplifica método de pago y reglas de monto).

## Stack elegido

Backend y lógica en **Node + TypeScript**, un solo lenguaje compartido con el frontend. Persistencia en **Postgres vía Prisma** (reemplaza Dataverse). Frontend en la misma casa TS (Next.js o similar) para la app de captura por foto y la interfaz de administración de conta. La lógica de negocio va en módulos puros sin dependencias de framework ni de proveedor, cubiertos por tests.

Se descartó .NET pese a su afinidad con FO: la integración se resuelve por API/OData, así que esa ventaja no aplica, y un solo lenguaje front+back reduce fricción.

## Forma del código (hexagonal / ports & adapters)

Todo lo que en Power Platform era "gratis" se expresa como una **interfaz (puerto)**; el dominio depende de la interfaz, no del proveedor. Así se puede cambiar de OCR, de proveedor de correo o de storage sin tocar la lógica.

```
src/
  domain/        # logica pura, sin IO — el corazon portado (con tests)
    types.ts             Tipos y constantes de negocio
    num.ts               toNum(): fuerza montos del XML a numero (default 0)
    clave.ts             Clave 50 digitos: validar / desglosar / extraer de OCR
    parseFactura.ts      Ingesta XML ignorando namespaces (local-name())
    situacionFiscal.ts   IVA > EXENTO > NO SUJETO (prioridad)
    cruce.ts             Foto <-> factura por clave dentro del OCR normalizado
    metodoPago.ts        Proposito + moneda -> CAJA CHICA/FONDOS_PERS/TARJET_*
    combustible.ts       Heuristica de tipo (Diesel > Gas LP > Gasolina)
    reglasMonto.ts       Exceso de tope segun moneda del informe
    grupoImpuesto.ts     Grupo de articulos (tarifa embebida en el nombre)
    validaciones.ts      Bloqueos al guardar/enviar
  ports/         # interfaces: OCR, correo entrante, storage, auth, notificacion, finance (FO)
  adapters/      # implementaciones concretas
    finance/foHttpClient.ts   Llama al servicio X++ por API (OAuth2 client_credentials)
  services/      # orquestacion
    ingestaFactura.ts    Correo -> decode base64 -> parse -> dedup -> guardar PDF
    posteoFO.ts          Aprobacion de conta -> cabecera + N lineas -> FO (anti-duplicado)
prisma/schema.prisma      Modelo de datos (Postgres)
test/                     Vitest, validado contra 4 XML reales de Nutricare
```

## Modelo de datos

Cuatro entidades núcleo — Captura, Factura, Liquidacion, Gasto — más catálogos (Categoria, CentroCosto, GrupoImpuesto, ReglaMonto) y una tabla de Auditoría (en Dataverse era nativa; afuera se construye). Detalle completo en `prisma/schema.prisma`. Puntos a notar: la clave de la factura es única (permite upsert y dedup); el número de reporte FO en la liquidación es la señal anti-duplicado del posteo; y el gasto tiene autorrelación para soportar la división de gastos pendiente.

## Integración con D365 FO

No cambia. El servicio X++ `NTCExpenseReportService` se expone como custom service / OData y el backend lo llama por HTTP con una **cuenta de servicio dedicada** (la cuenta de desarrollo actual es deuda técnica a resolver). El adapter `FoHttpClient` implementa el puerto `FinancePort` y arma el payload alineado al `DataContract` del X++.

Detalles ganados con prueba y error que siguen aplicando: empresa en MAYÚSCULA; `LegalEntity` es RecId int64, no string; `CostType` con el código exacto y activo en NTC y FEH ("COMBUSTIBLES", plural); `ApprovalStatus = Create` (borrador, confirmado por conta); `TaxGroup` = situación fiscal (grupo de venta), `TaxItemGroup` = grupo de la categoría (grupo de artículos, con la tarifa embebida).

Dos pendientes del traspaso ya quedan preparados en el código nuevo: el puerto `FinancePort` y `postearInforme` ya manejan **N líneas** y **anti-duplicado**; falta que el servicio X++ acepte la lista de líneas en una sola llamada atómica (hoy el adapter degrada a la primera línea y lo deja marcado con un `TODO`).

## Servicios externos a contratar

OCR (Azure Document Intelligence / Google / AWS), correo entrante para los XML (inbound email o IMAP), storage de archivos (S3 / R2 / Blob), identidad (Auth0 / Clerk / Supabase Auth) y notificaciones de aprobación (email u otro canal, reemplazando Teams). Cada uno tiene su puerto definido; falta la implementación concreta. Cotizar con el volumen real (~1.600 gastos/mes). Afuera no hay límites de API premium de Dataverse, así que el cruce escala mejor (endpoint disparado por cron).

## Plan por fases

La **fase 0** (esta entrega) es el corazón portado con tests y el andamiaje: dominio, puertos, adapter de FO, esquema y servicios de ingesta y posteo. La **fase 1** implementa los adapters reales (OCR, correo, storage, auth) y expone el API. La **fase 2** construye el frontend: app de captura por foto y la interfaz de administración de conta (vistas por estado, subgrid de gastos, edición de catálogos). La **fase 3** cierra los pendientes de negocio: división de gastos, régimen simplificado y la evolución del servicio X++ a N líneas.

## Verificación

35 tests en Vitest, verdes, validados contra los 4 XML reales entregados (dos EXENTO, dos NO SUJETO, uno de ellos Diésel). Cubren parser, situación fiscal, combustible, método de pago, reglas de monto, cruce con OCR ruidoso, desglose de clave, validaciones y el anti-duplicado del posteo. `tsc --noEmit` pasa sin errores.
