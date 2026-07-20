# Despliegue en Azure App Service

Arquitectura: **un solo App Service** (Node, Linux). El backend sirve también el
frontend ya compilado (`frontend/dist`). Despliegue automático con **GitHub Actions**
al hacer push a `main` (workflow en `.github/workflows/azure-deploy.yml`).

## 1. Crear el App Service (una vez)
1. Portal de Azure → *Create a resource* → **Web App**.
2. Runtime stack: **Node 20 LTS**, Sistema operativo **Linux**.
3. Región: la más cercana (ej. Central US / East US).
4. Plan: B1 o superior (evitar Free F1 por límites de CPU/always-on).
5. Anotar el **nombre** del App Service (ej. `nutricare-liquidacion`).

## 2. Configurar el App Service
### 2.1 Startup Command
Configuration → **General settings** → *Startup Command*:
```
npm run start:azure
```

### 2.2 App settings (variables de entorno)
Configuration → **Application settings** → agregar (equivalen al `.env`):

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | cadena de conexión Postgres (prod) |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | app registration / cuenta de servicio |
| `FO_BASE_URL` / `FO_SERVICE_PATH` / `FO_SCOPE` | Dynamics FO |
| `AZURE_BLOB_CONTAINER_SAS_URL` **o** SharePoint (`STORAGE_PROVIDER`, `SHAREPOINT_SITE_ID`, ...) | almacenamiento de adjuntos |
| `AZURE_DOCINT_ENDPOINT` / `AZURE_DOCINT_KEY` | Document Intelligence (OCR) |
| `GRAPH_MAILBOX_USER_ID` | buzón de facturación |
| `APPROVALS_CALLBACK_SECRET` | secreto del callback de Teams |
| `ALLOW_SELF_APPROVAL` | `0` |
| `ALLOW_RESET` | `0` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (ya compilamos en el pipeline) |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

> No hace falta `PORT`: App Service lo inyecta y el backend ya lo lee.

## 3. Conectar el despliegue automático
1. En el App Service: **Deployment Center** → Source **GitHub** → autorizar → elegir el repo `Nutricare-Desarrollo/Liquidaci-n-de-gastos`, rama `main`.
   - Esto crea el secret del publish profile automáticamente. **O** manualmente:
     App Service → *Download publish profile* → en GitHub: repo → Settings → Secrets and variables → Actions → New secret:
     - `AZUREAPPSERVICE_PUBLISHPROFILE` = contenido del archivo `.publishsettings`.
2. Agregar también en GitHub el secret **`DATABASE_URL`** (para las migraciones).
3. Editar `.github/workflows/azure-deploy.yml` → `AZURE_WEBAPP_NAME` con el nombre real.

## 4. Desplegar
- `git push` a `main` dispara el workflow: compila backend + frontend, corre migraciones y publica.
- Ver el progreso en GitHub → pestaña **Actions**.

## 5. Verificar
- Abrir `https://<nombre>.azurewebsites.net` → debe cargar la web.
- Login con MFA (Entra), crear una liquidación por propósito, y (con FO configurado) un posteo de prueba.

## Notas
- El login MSAL (frontend) usa el `AZURE_CLIENT_ID`; agregá la **redirect URI**
  `https://<nombre>.azurewebsites.net` en el App registration (SPA) de Entra.
- Para el callback de aprobación de Teams, usá `https://<nombre>.azurewebsites.net/...`
  (ya no hace falta el túnel local).
