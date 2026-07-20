# Checklist de publicación — versión para validación de Contabilidad

## Estado
- 7 temas de la reunión: implementados y verificados.
- Extras: combos con búsqueda, tarifa km editable, campo "Reporte FO".
- Gate: typecheck backend + frontend OK; pruebas (proposito + integración) OK.

## 1. Base de datos (ambiente destino)
- [ ] `npx prisma migrate deploy`  (aplica todas las migraciones nuevas)
- [ ] `npx prisma generate`
- [ ] Cargar en la app las **tarifas por km** reales (menú *Tarifas KM*: GAM y GIRAS).
- [ ] Confirmar **reglas de monto** reales (ALMUERZO_CENA 6000, DESAYUNO 4200, ALMUERZO_GIRA 6000).

## 2. Variables de entorno (.env de producción)
- [ ] `ALLOW_SELF_APPROVAL=0`  (solicitante ≠ aprobador)
- [ ] `ALLOW_RESET=0`  (deshabilitar el reset de datos)
- [ ] Credenciales de FO con **cuenta de servicio** dedicada (no la de desarrollo).
- [ ] URL pública del backend para el callback de aprobación de Teams (reemplaza el túnel con `--allow-anonymous`).

## 3. Build y arranque
- [ ] Backend:  `npm run build`  →  `npm start`
- [ ] Frontend: `cd frontend && npm run build`  (servir `dist/`), con `VITE_API_URL` apuntando al backend.

## 4. Dynamics FO
- [ ] Pase del X++ (tipo de cambio + zona/km + estado Aprobado) a **sandbox** completo.
- [ ] Un posteo de prueba end-to-end desde la app.

## 5. Humo post-deploy
- [ ] Login con MFA.
- [ ] Crear una liquidación de cada propósito y agregar un gasto.
- [ ] Kilometraje: monto = km × tarifa; anticipos: bloquea el 2º gasto.
- [ ] Aprobación por Teams (a revisión de conta / devuelta).
- [ ] Posteo a FO y que el nº de reporte quede en la liquidación.
