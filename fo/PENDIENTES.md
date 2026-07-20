# Pendientes — revisión con Contabilidad

## Ya resuelto en esta sesión (verificar en el próximo pase a sandbox)
- **Comerciante** en la línea de FO → `TrvExpTrans.MerchantId`. ✅
- **Número de factura** en la línea → `TrvExpTrans.ReceiptNumber` (electrónicas: consecutivo; régimen: manual). ✅
- **Estado del informe = Aprobado** (no Borrador) → `ApprovalStatus = Approved` en cabecera y líneas. ✅ (validar que habilite "Registrar" en conta)

## Estado de implementación (jul-2026)
- **A, B, C — IMPLEMENTADOS en código** (backend + frontend typechean limpio; X++ editado). Faltan pasos manuales:
  - Correr migración Prisma `20260716120000_gasto_kilometraje` (backend detenido) + `prisma generate`.
  - Compilar + empaquetar + desplegar el X++ (ZoneCode + KMOwnCar) a sandbox.
- **D (tipo de cambio) — IMPLEMENTADO en el X++**: se calcula por fecha con `CurrencyExchangeHelper` y se llena `ExchangeRate` + `AmountMST` (coloniza). Confirmado: campos `ExchangeCode` (moneda) y `ExchangeRate` (tasa, factor 100). Verificar firma de `calculateTransactionToAccounting`/`exchRate` en el build.
- **E (nº reporte FO)** — ya se guarda (`numeroReporteFO`) y se muestra en el detalle. Falta (opcional) mostrarlo en el listado.

## Pendientes

### A. Regla central: método de pago + categorías según PROPÓSITO
Hoy `metodoPago(proposito, moneda)` es simple. Hay que ampliarlo por propósito. Toca:
backend (dominio + construcción del gasto), frontend (selector de propósito, filtro de categorías),
y el envío a FO (PayMethod).

| Propósito | Método de pago | Categorías | Notas |
|---|---|---|---|
| TARJETA CORPORATIVA | (actual: TARJET_COR / TARJET_DOL por moneda) | todas | sin cambios |
| PAGO CON FONDOS PERSONALES | FONDO_PERS | todas | |
| CAJA CHICA - TESORERÍA | CAJA_TESOR | todas | |
| CAJA CHICA - ALMACÉN | CAJA_ALMAC | todas | |
| LIQUIDACIÓN ANTICIPOS | DEV-ANTICI | (definir) | |
| ANTICIPOS | FONDO_PERS | solo ANTICIPO_EMPLEADOS | **1 solo gasto** por liquidación |
| KILOMETRAJE | FONDO_PERS | KILOMETRAJE o COMBUSTIBLE | + campos Zona, Fecha, Kilómetros |

**Datos que necesito confirmar (OData/AOT del sandbox):**
- Lista exacta de valores de **Purpose** en FO (¿"CAJA CHICA - TESORERÍA" / "CAJA CHICA - ALMACÉN" son 2 valores distintos?).
- Código exacto de la categoría de anticipos (¿`ANTICIPO_EMPLEADOS`?).
- Que existan los métodos de pago: FONDO_PERS, CAJA_TESOR, CAJA_ALMAC, DEV-ANTICI, TARJET_COR, TARJET_DOL.

### B. ANTICIPOS (propósito especial)
- Solo categoría de anticipos, método FONDO_PERS.
- **Un único gasto** por liquidación (validación al agregar gasto).
- Es un informe igual que los demás, solo cambia el propósito.

### C. KILOMETRAJE (propósito especial)
- Categorías KILOMETRAJE o COMBUSTIBLE, método FONDO_PERS.
- **3 campos adicionales** en el gasto: **Zona**, **Fecha**, **Kilómetros**.
- Mapear a los campos de FO (línea): kilómetros → `TrvExpTrans.Mileage...` (confirmar nombre; se vio `MileageFrom`). Zona → confirmar campo.

### D. Tipo de cambio (ExchangeRate) en la línea de FO
- En FO se autocompleta solo al seleccionar la moneda manualmente; por servicio hay que llenarlo.
- Para CRC probablemente sea el default (en el dump se vio `ExchangeRate = 100`). Para USD, la tasa real.
- Investigar: setear `TrvExpTrans.ExchangeRate` o invocar el método de FO que lo calcula por moneda+fecha.

### E. Traer el número de reporte FO al app
- Ya guardamos `numeroReporteFO` en la liquidación al postear (viene de la respuesta del servicio) y se muestra en el detalle.
- **Acción:** verificar que se vea bien; si hace falta, mostrarlo también en la lista de liquidaciones.
- (Complejidad baja — mayormente hecho.)

## Orden propuesto
1. **A — Propósito → método de pago + categorías** (desbloquea CAJA CHICA, FONDOS PERSONALES, LIQUIDACIÓN ANTICIPOS y parte de ANTICIPOS/KILOMETRAJE).
2. **B — ANTICIPOS** (regla de 1 solo gasto + categoría).
3. **C — KILOMETRAJE** (campos Zona/Fecha/Km + mapeo FO).
4. **D — Tipo de cambio** (requiere definir el modelo de FO).
5. **E — Nº de reporte FO** (verificación/ajuste menor).
