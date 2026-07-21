# Levantar un entorno NUEVO para un compañero (App Service + base separados)

Objetivo: que un compañero tenga su **propia base** y su **propio App Service**,
sin tocar el entorno de producción.

## 1. Base de datos nueva (Neon)
1. Entrar a la consola de Neon (https://console.neon.tech).
2. Crear un **proyecto nuevo** (o una branch nueva) → esto da una base aislada.
3. Copiar su **connection string** (formato `postgresql://user:pass@host/db?sslmode=require`).

## 2. Inicializar esa base (esquema + catalogos)
1. En un `.env` (puede ser una copia), poner `DATABASE_URL=` con la cadena NUEVA.
2. Correr **`db-init.bat`** → aplica migraciones, genera el cliente y carga los catalogos
   (empleados, categorias, anticipo, centros de costo, reglas).
   - Ojo: verifica que `.env` apunte a la base NUEVA antes de correrlo.

## 3. App Service nuevo
1. `az login` en la suscripcion correcta.
2. Correr **`azure-setup-colega.bat`** → crea `nutricare-liquidacion-dev` (mismo grupo/plan,
   pero app y URL distintas) y genera `publish-profile-colega.xml`.
   - Podes cambiar `APP=` arriba del `.bat` por otro nombre unico.

## 4. App settings del App Service nuevo
Cargar las variables (con la **DATABASE_URL NUEVA**). Editar `azure-appsettings.ps1`
cambiando `$APP` a `nutricare-liquidacion-dev`, o a mano:
```
az webapp config appsettings set -g rg-nutricare-liquidacion -n nutricare-liquidacion-dev --settings ^
  DATABASE_URL="postgresql://...NUEVA..." AZURE_TENANT_ID="..." AZURE_CLIENT_ID="..." AZURE_CLIENT_SECRET="..." ^
  FO_BASE_URL="..." FO_SERVICE_PATH="..." FO_SCOPE="..." APPROVALS_CALLBACK_SECRET="..." ^
  AZURE_DOCINT_ENDPOINT="..." AZURE_DOCINT_KEY="..." GRAPH_MAILBOX_USER_ID="..." STORAGE_PROVIDER="sharepoint" SHAREPOINT_SITE_ID="..."
```

## 5. Desplegar el codigo al App Service nuevo
Dos opciones:
- **Local (mas simple para pruebas):** el compañero corre el backend en su maquina contra la base
  nueva (`npm run real:watch` con su `.env`) — no necesita el App Service.
- **En Azure:** duplicar el workflow (`.github/workflows/azure-deploy-dev.yml`) con
  `AZURE_WEBAPP_NAME: nutricare-liquidacion-dev` y un secret nuevo
  `AZUREAPPSERVICE_PUBLISHPROFILE_DEV` (contenido de `publish-profile-colega.xml`).

## Notas
- El entorno nuevo NO comparte datos con el tuyo (base distinta).
- Para el login (Entra), pueden reusar el mismo App registration; agregar la redirect URI
  `https://nutricare-liquidacion-dev.azurewebsites.net` en Authentication (SPA).
- `ALLOW_SELF_APPROVAL=1` y `ALLOW_RESET=1` quedan activos en el dev (para pruebas).
