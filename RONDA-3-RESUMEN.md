# Ronda 3 — Ajustes Conta (resumen)

Fecha: 2026-07-28 · Estado: **15/15 implementados**, compila limpio (backend + frontend).

## Cambios por punto

| # | Punto | Qué se hizo |
|---|-------|-------------|
| 1 | Filtro de liquidaciones | Móvil: el dropdown "liquidación existente" solo muestra **Borrador/Devuelta**. |
| 2 | Obligatorios | Al **Enviar**: nº factura + adjunto obligatorios. Excepción: Anticipos (ninguno), Kilometraje (solo adjunto). |
| 3 | EXCEDE sin método (Fondos Personales) | **Config de FO** (Conta): habilitar `FONDO_PERS` en la categoría EXCEDE. *No es código.* |
| 4/9 | Editar montos del gasto | Input de monto en el detalle. Conta/admin siempre; estándar solo en su liquidación Borrador/Devuelta. Recalcula el total. |
| 5 | Clonar liquidación | Botón "Clonar" → nueva en Borrador con copia de gastos (solo info, sin adjuntos/factura/captura). |
| 6 | IVA + Subtotal | Bloque Subtotal/IVA/Total en todos los gastos, menos kilometraje y anticipos. |
| 7 | Factura manual | `consecutivo` obligatorio, `clave` opcional (se autogenera si va vacía). |
| 8 | Estado gasto + desligar | Estado **Asociado/Libre**. Botón "Desligar" + selector "Asociar gasto libre" (valida misma moneda). |
| 10 | Origen | Campo Origen **XML/Manual** en factura y gasto (la factura lo hereda). Columna en el detalle. |
| 11 | Anticipos | Dentro del gasto la categoría ya se puede cambiar (solo el alta queda fija). *Ya estaba.* |
| 12 | Re-postear a FO | Informe **nuevo** en FO (ExternalId versionado) + **rechazo** del anterior. Requiere X++ nuevo (abajo). |
| 13 | Nº reporte FO manual | Ante timeout: cargar a mano el nº de reporte FO y marcar POSTEADA (reconciliación). |
| 14a | Farmacia + combustible sin método | **Config de FO** (Conta): habilitar el método en esa categoría. *No es código.* |
| 14b | Colaboradores Farmacia no aparecen | **A investigar**: filtro por dominio / exclusiones en Entra/Graph. |
| 15 | Empresa NTC/FEH en centros | Campo `empresa` en centros: selector en Mantenimiento (Ambas/NTC/FEH) + filtro por empresa en el móvil. |

## Migraciones nuevas (aplicar **antes** del deploy de código)

1. `20260728120000_factura_gasto_origen` — columna Origen (punto 10)
2. `20260728130000_centro_empresa` — empresa en centros (punto 15)
3. `20260728140000_gasto_estado_desligar` — estado del gasto + `liquidacionId` opcional (punto 8)
4. `20260728150000_liquidacion_version_fo` — versión del informe FO (punto 12)

## Orden de deploy

1. `migrar-y-arrancar.bat` (o `db-init.bat`) → aplica las 4 migraciones a Neon.
2. `subir-git.bat` → push + CI a Azure.

> Si se sube el código antes de migrar, Prisma falla al leer las columnas nuevas.

## Pendiente en Dynamics (punto 12)

- Compilar y **exponer en el Service Group** el método nuevo `rejectExpenseReport`
  (archivo `fo/NTCExpenseReportService.xpp`).
- Si tu versión de FO no tiene `TrvAppStatus::Rejected`, usar el valor de rechazo equivalente.
- Variable de entorno `FO_REJECT_SERVICE_PATH` (tiene default apuntando a `.../rejectExpenseReport`).

## Config que hace Conta en FO (no es código)

- Punto 3: habilitar `FONDO_PERS` en categoría EXCEDE.
- Punto 14a: habilitar el método de pago en la categoría de combustible de Farmacia.
