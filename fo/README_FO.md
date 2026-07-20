# Conexión con Dynamics 365 Finance & Operations

El sistema postea el informe a FO cuando **Contabilidad aprueba** (`Aprobar conta → postear`).
Se envía **1 cabecera + N líneas** en una sola llamada atómica, con **anti-duplicado** por
`ExternalId` (el id de la liquidación). Si se reintenta, FO devuelve el reporte ya existente
en vez de duplicarlo.

## 1. Campo de extensión (anti-duplicado)

En Visual Studio (proyecto D365), sobre tu modelo:

1. Creá un **EDT** tipo *String* llamado `NTCExternalId` (largo 100).
2. Creá una **extensión de tabla** `TrvExpTable.Extension` y agregá el campo
   `NTCExternalId` (basado en el EDT).
3. **Build** + **Synchronize database**.

> Si preferís no extender la tabla, se puede quitar el anti-duplicado del X++, pero se pierde
> la protección ante reintentos. Recomendado dejarlo.

## 2. Clases del servicio

Agregá a tu modelo las clases de `NTCExpenseReportService.xpp`:
`NTCExpenseReportLineContract`, `NTCExpenseReportRequestContract`,
`NTCExpenseReportResponseContract`, `NTCExpenseReportService`.

## 3. Exponer como servicio (Service Group)

1. Creá un **Service** `NTCExpenseReportService` con la operación `createExpenseReport`
   (clase `NTCExpenseReportService`, método `createExpenseReport`).
2. Creá un **Service Group** llamado **`NTCExpenseReportServiceGroup`** que contenga ese servicio.
3. **Build & Deploy**. El endpoint queda en:

   ```
   POST {FO_BASE_URL}/api/services/NTCExpenseReportServiceGroup/NTCExpenseReportService/createExpenseReport
   ```

   (esta es exactamente la ruta por defecto de `FO_SERVICE_PATH`).

## 4. Autenticación (cuenta de servicio)

El backend llama con **OAuth2 client_credentials**. Podés reutilizar el mismo registro de app
que ya usás para Graph/SharePoint (`AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`), o crear uno
dedicado (recomendado a futuro).

En **FO**: *System administration → Setup → Microsoft Entra ID applications* → **New**:
- **Client Id**: el Application (client) ID del registro de app.
- **Name**: descriptivo (ej. "Liquidaciones API").
- **User Id**: un usuario de FO con permiso para crear reportes de gastos (cuenta de servicio).

## 5. Variables de entorno (backend `.env`)

```
FO_BASE_URL=https://<tu-org>.operations.dynamics.com
FO_SERVICE_PATH=/api/services/NTCExpenseReportServiceGroup/NTCExpenseReportService/createExpenseReport
FO_SCOPE=https://<tu-org>.operations.dynamics.com/.default
```

`FO_SCOPE` es la **URL del ambiente FO** + `/.default` (recurso para client credentials).
Con estas tres variables presentes, el backend cambia el modo a `fo=real` (lo ves en la
primera línea de log `[deps] ...`). Si faltan, queda en `fo=FAKE` (no postea de verdad).

## 6. Mapeo de campos (referencia)

| Nuestro campo        | X++ (contrato)        | Tabla FO                 |
|----------------------|-----------------------|--------------------------|
| empresa (ntc/feh)    | Company               | TrvExpTable.InterCompanyLE |
| personnelNumber      | PersonnelNumber       | HcmWorker (por nº)       |
| purpose              | Purpose               | TrvExpTable.Txt2         |
| descripción          | Description           | TrvExpTable.Txt1         |
| id liquidación       | ExternalId            | TrvExpTable.NTCExternalId |
| categoría            | Lines[].CostType      | TrvExpTrans.CostType     |
| monto                | Lines[].Amount        | TrvExpTrans.AmountCurr   |
| moneda (CRC/USD)     | Lines[].Currency      | TrvExpTrans.ExchangeCode |
| método pago          | Lines[].PayMethod     | TrvExpTrans.PayMethod    |
| fecha                | Lines[].TransDate     | TrvExpTrans.TransDate    |
| situación fiscal     | Lines[].TaxGroup      | TrvExpTrans.TaxGroup     |
| grupo de artículos   | Lines[].TaxItemGroup  | TrvExpTrans.TaxItemGroup |

## 7. Puntos a confirmar con Contabilidad

- **ApprovalStatus**: el X++ crea con `TrvAppStatus::Create`. Confirmá si debe quedar en
  `Create` (borrador para revisión en FO) o en otro estado.
- **Formato de fecha**: se envía ISO `yyyy-MM-dd`. Si FO espera otro formato en tu build,
  se ajusta en el adapter (`foHttpClient.ts`).
- **PayMethod / TaxGroup / CostType**: los valores deben existir en FO con el mismo código
  (ya alineados con el mapeo actual del sistema).
