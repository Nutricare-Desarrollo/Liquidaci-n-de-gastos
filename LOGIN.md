# Activar el login (Entra/MFA) en producción

El código de login ya existe; solo hay que **configurar** frontend y backend en producción.
Hoy está apagado, por eso entra directo como admin de dev.

## 1. Secrets en GitHub (frontend, se inyectan en el build)
Repo → Settings → Secrets and variables → Actions → New secret:

- `VITE_AAD_CLIENT_ID`  = Application (client) ID del App registration.
- `VITE_AAD_TENANT_ID`  = Directory (tenant) ID.
- `VITE_API_SCOPE`      = el scope expuesto en "Expose an API", ej. `api://<client-id>/access_as_user`.

(No son secretos críticos, pero se manejan como secrets para no hardcodearlos.)

## 2. App settings en el App Service (backend, valida el token)
Configuration → Application settings:

- `AUTH_ENABLED` = `1`
- `AZURE_TENANT_ID` = tenant ID
- `API_AUDIENCE` = el `aud` del token (normalmente el client ID, o `api://<client-id>`)
- `ROLE_ADMIN` = valor exacto del App Role de admin en Entra (ej. `Admin`)
- `ROLE_CONTA` = valor exacto del App Role de contabilidad (ej. `Contabilidad`)

> Con `AUTH_ENABLED=1` deja de usar `DEV_ROLES` (que daba admin a todos).

## 3. Entra (App registration)
- **Authentication → SPA → Redirect URI**: `https://nutricare-liquidacion.azurewebsites.net`
- **App roles**: crear `Admin` y `Contabilidad` (los valores deben coincidir con ROLE_ADMIN/ROLE_CONTA).
- **Asignar usuarios** a los roles (Enterprise applications → Users and groups). Quien no tenga rol admin/conta entra como usuario estándar.

## 4. Desplegar
- Después de cargar los secrets, hacé push (o Re-run del workflow) para que el frontend se recompile CON las variables.
- El backend toma las app settings al reiniciar (guardar settings reinicia el App Service).

## Verificar
- Abrir la URL → ahora debe mostrar "Iniciar sesión con Microsoft".
- Un usuario de contabilidad debe entrar como **Contabilidad** (no admin), y un estándar solo ve Captura.
