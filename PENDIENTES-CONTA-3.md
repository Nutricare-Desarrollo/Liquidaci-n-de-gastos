# Pendientes — ajustes Conta (ronda 3)

## A. Rápidos / claros (frontend) — ✅ HECHO
- **7. ✅ Factura manual:** `consecutivo` obligatorio, `clave` opcional (si viene vacía se genera placeholder única).
- **11. ✅ Anticipos:** dentro del gasto la categoría ya se puede cambiar (el combo no filtra por propósito); solo el alta queda fija.
- **2. ✅ Obligatorios:** nº de factura + adjunto **obligatorios al ENVIAR** en todas, EXCEPTO
  ANTICIPOS = ninguno; KILOMETRAJE = solo el adjunto. (Validación en `validarGasto` + `enviarInforme`.)
- **6. ✅ IVA + Subtotal en TODOS los gastos** (incluido régimen), NO en kilometraje ni anticipos. (Bloque en el detalle del gasto.)
- **10. ✅ Columna "Origen"** XML / Manual: campo en Factura+Gasto (migración `20260728120000_factura_gasto_origen`),
  la factura lo hereda al gasto al cruzar; manuales/régimen = MANUAL. Columna en el detalle.

> Deploy de A: **primero aplicar la migración** a Neon (correr `migrar-y-arrancar.bat` o `db-init.bat`),
> **luego** `subir-git.bat`. Si se sube el código antes de que exista la columna `origen`, Prisma fallará.

## B. Backend + frontend (medio) — ✅ HECHO
- **4 y 9. ✅ Editar montos del gasto:** input de monto en el detalle. Contabilidad/admin siempre;
  estándar solo su propia liquidación en BORRADOR/DEVUELTA (control en endpoint PATCH /gastos/:id).
  Al cambiar el monto se recalcula el total del informe.
- **13. ✅ Nº de reporte FO manual:** endpoint `/liquidaciones/:id/reconciliar-fo` + bloque en el
  detalle (visible con ERROR_POSTEO o APROBADA) para cargar el nº FO y marcar POSTEADA.
- **15. ✅ Empresa (NTC/FEH) en centros:** campo `empresa` (migración `20260728130000_centro_empresa`),
  selector en Mantenimiento (Ambas/NTC/FEH) y filtro por empresa en el móvil.
- **5. ✅ Clonar liquidación + gastos** (solo info, sin adjuntos/factura/captura): botón "Clonar" en
  el detalle → nueva en BORRADOR.

> Deploy de B: incluye la migración `20260728130000_centro_empresa`. Igual que A: **migración primero,
> luego push.** (Ambas migraciones se aplican con `migrar-y-arrancar.bat` / `db-init.bat`.)

## C. Definidos (listos para implementar)
- **1. ✅ Filtro de liquidaciones:** el dropdown de "liquidación existente" (móvil) ya muestra solo
  Borrador o Devuelta.
- **8. ✅ Estado del gasto + desligar:** campo `estadoGasto` (ASOCIADO/LIBRE) y `liquidacionId` ahora
  opcional (migración `20260728140000_gasto_estado_desligar`). Botón **Desligar** en el detalle del gasto
  (queda LIBRE) y selector **Asociar gasto libre** en el detalle de la liquidación (valida misma moneda).
  Permisos: conta/admin siempre; estándar solo su liquidación en borrador/devuelta.
- **12. ✅ Re-postear a FO:** botón "Re-postear a FO (informe nuevo)" en el detalle (visible en POSTEADA).
  Genera un informe NUEVO en FO con ExternalId versionado (`<liqId>#v2`, `#v3`...), **postea primero el
  nuevo** y luego **rechaza el anterior** en FO. Migración `20260728150000_liquidacion_version_fo`.
  Requiere el método X++ nuevo `rejectExpenseReport` (ver `fo/NTCExpenseReportService.xpp`) compilado y
  **expuesto en el Service Group**, más `FO_REJECT_SERVICE_PATH` en el entorno (tiene default).

## D. Config de FO (lo maneja Conta/admin FO, no es código nuestro)
- **3. EXCEDE sin método** cuando el propósito es Fondos Personales → habilitar `FONDO_PERS` para la
  categoría EXCEDE en FO.
- **14a. Farmacia + combustible sin método** → habilitar el método en esa categoría en FO.

## E. Investigar
- **14b. Colaboradores de Farmacia no aparecen** en el directorio (usuarios de Entra/Graph). Revisar
  filtro por dominio / exclusiones (¿Farmacia usa otro dominio o están fuera del filtro?).

## Orden sugerido
1. **A** (rápidos): 7, 11, 2, 6, 10.
2. **B**: 4/9, 13, 15, 5.
3. Definir **C** (1, 8, 12) y luego implementarlos.
4. **D** → Conta en FO. **E** (14b) → investigo.
