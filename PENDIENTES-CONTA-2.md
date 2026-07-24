# Pendientes — pruebas de Contabilidad (ronda 2)

## Críticos (afectan el posteo / datos a FO)
### 1. Empleado sale como dev@nutricare.co.cr (móvil) + "No se encontró el empleado"
- Causa raíz probable: **login (Entra) no activo en prod** (`auth=FAKE`) → sesión = usuario dev.
- Fix: completar `LOGIN.md` (AUTH_ENABLED=1, secrets `VITE_AAD_*`, roles + redirect en Entra).
- Al activar login, fluye el correo real y el empleado resuelve (personnelNumber).
- Tipo: **config**. Desbloquea también el posteo por empleado.

### 2. Método de pago y nº de comprobante incompletos en FO
- 2a. Con varios gastos manuales, el **método de pago** solo quedó en una línea.
- 2b. Al **dividir** un gasto manual, no se copia el **nº de comprobante** al derivado.
- Tipo: **backend**. 2b: `dividirGasto` debe copiar `numeroFactura`. 2a: revisar `metodoPago`
  guardado en esos gastos (posible división / dato viejo).

### 6. "Información adicional" no viaja a FO
- El gasto tiene `informacionAdicional` pero no se envía a la línea.
- Tipo: **backend + X++**. Falta confirmar el campo de `TrvExpTrans` de "Información adicional".

## Mejoras rápidas (frontend)
### 3. Campo "Número de factura" en el alta de gasto manual
- Agregar el input en el formulario "+ Gasto" (el backend ya lo acepta).

### 4. Columnas en el listado de liquidaciones
- Agregar: **Nombre del empleado**, **Centro de costo**, **Descripción**.
- Aclarar qué es "Descripción" (¿el nombre, o un campo nuevo que ingrese el usuario?).

### 7. Marcar gastos "cruzadas" en Detalle de gastos
- Indicador/columna que muestre los gastos ligados a factura electrónica (tienen `facturaId`).

## Mejora media (frontend)
### 5. Filtros por columna en las tablas
- Liquidaciones, facturas, gastos, capturas. Ideal: componente de tabla reutilizable con filtros.

## Orden sugerido
1. **Login (punto 1)** — desbloquea empleado + posteo correcto. (config, tuya)
2. **2b + 6 + 2a** — completar datos que van a FO. (necesito el campo FO de "info adicional")
3. **3, 4, 7** — mejoras rápidas de UI.
4. **5** — filtros (más grande, al final).
