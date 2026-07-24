# Checklist de pruebas end-to-end

## 0. Login y roles
- [ ] Abrir la URL → pide "Iniciar sesión con Microsoft" (MFA).
- [ ] `/health` muestra `auth=entra`, `fo=real`, `notif=teams`.
- [ ] Un usuario con rol **Contabilidad/Admin** ve la pestaña Contabilidad; uno **estándar** solo Captura.

## 1. Móvil (Captura)
- [ ] Crear liquidación nueva → el mensaje dice a qué liquidación se envió.
- [ ] El "Correo empleado" es el del **usuario logueado** (no dev@).
- [ ] Selector de propósito muestra los 7.
- [ ] Combos (categoría, etc.) filtran al escribir.

## 2. Propósitos (abrir el gasto y ver "Método pago")
- [ ] TARJETA CORPORATIVA → TARJET_COR (CRC) / TARJET_DOL (USD)
- [ ] PAGO CON FONDOS PERSONALES → FONDO_PERS
- [ ] CAJA CHICA - TESORERÍA → CAJA_TESOR ; ALMACÉN → CAJA_ALMAC
- [ ] LIQUIDACIÓN ANTICIPOS → DEV-ANTICI
- [ ] ANTICIPOS → FONDO_PERS, solo categoría Anticipo_Empleados, bloquea 2º gasto
- [ ] KILOMETRAJE → FONDO_PERS, campos Zona/Km, monto = km × tarifa

## 3. Gasto manual (+ Gasto)
- [ ] Aparece campo **Número de factura**.
- [ ] Se puede **adjuntar** foto/PDF al crear.
- [ ] Categoría COMBUSTIBLE → pide Litros + Tipo, oculta Zona/Km.
- [ ] Al cambiar la categoría, los campos km/combustible se ocultan/muestran bien.

## 4. Detalle de gastos (tabla)
- [ ] Columnas: Centro costo, Cruce (Cruzada/Manual), Nº factura, Justificación.
- [ ] Dividir un gasto → el derivado conserva nº factura, justificación y centro.

## 5. Liquidación (encabezado)
- [ ] Centro de costo editable (se aplica a los gastos).
- [ ] Documentos adjuntos: subir y ver enlace.
- [ ] Factura asociada muestra Subtotal + IVA; el monto ya no dice "Otra".

## 6. Listados / filtros
- [ ] Listado de liquidaciones: columnas Empleado + Centro costo; orden por fecha.
- [ ] Buscador arriba de cada grilla (liquidaciones, facturas, gastos, capturas).

## 7. Flujo de aprobación
- [ ] Enviar → mensaje "Se envió la aprobación (Teams) a ..." + ejecución en Power Automate.
- [ ] Aprobar en Teams → pasa a EN_REVISION_CONTA ; Rechazar → DEVUELTA.
- [ ] Justificación obligatoria si un gasto excede el límite (bloquea Enviar).

## 8. Posteo a FO (Aprobar conta → postear)
- [ ] "Reporte FO" queda con número real (no EXP-DEMO).
- [ ] En FO: monto colonizado (USD), nº factura, comerciante, zona/km,
      dimensiones A/B/C, e Información adicional.
