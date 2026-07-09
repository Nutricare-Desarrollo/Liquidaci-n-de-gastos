# Guía de producción — Nutricare Liquidación

Objetivo: probar todo con piezas reales antes de conectar Dynamics (que se deja de último). Vamos por fases; cada servicio se enciende por separado. Si un servicio no tiene credenciales, el sistema usa un "simulado" (FAKE) y sigue funcionando, así avanzamos sin bloquearnos.

## Fase A — Modo real local con Postgres (empezar aquí)

Valida el stack completo con base de datos real en tu máquina. Los servicios de Azure quedan en FAKE hasta la Fase B.

Requisitos: Node 20+ y Docker Desktop instalados.

Pasos (en la carpeta del proyecto):

1. Copiá el archivo de entorno: `copy .env.local.example .env` (Windows) y dejalo tal cual para empezar.
2. Levantá la base de datos: `npm run db:up` (arranca Postgres en Docker).
3. Generá el cliente y creá las tablas: `npm run prisma:generate` y luego `npm run prisma:migrate`.
4. Cargá catálogos, usuarios y facturas demo: `npm run prisma:seed`.
5. Arrancá el backend en modo real: `npm run real` (verás en consola qué servicios están reales y cuáles en FAKE).
6. En otra terminal, el frontend: `cd frontend` y `npm run dev`. Abrí `http://localhost:5173`.

Diferencia con el demo: los datos ahora **persisten** en Postgres (no se borran al reiniciar). El resto de la experiencia es igual, pero ejercitando la base real.

## Fase B — Encender servicios de Azure, uno por uno

Cada servicio se activa agregando sus variables al `.env` y reiniciando `npm run real`. El arranque informa el modo de cada uno.

- OCR (leer la clave de fotos): `AZURE_DOCINT_ENDPOINT`, `AZURE_DOCINT_KEY` (recurso Azure AI Document Intelligence).
- Identidad + aprobadores desde Entra: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (app registration). Permiso Graph: `User.Read.All` (aprobadores). Con esto el selector de aprobador sale de Entra.
- Correo entrante (XML de facturas): `GRAPH_MAILBOX_USER_ID=facturacion@nutricare.co.cr`. Permiso Graph: `Mail.Read` / `Mail.ReadWrite` sobre el buzón. El job corre con `POST /jobs/ingesta-correo` (programalo por cron).
- Storage en SharePoint (PDF del correo y adjuntos): `STORAGE_PROVIDER=sharepoint`, `SHAREPOINT_SITE_ID`, opcional `SHAREPOINT_DRIVE_ID`, `SHAREPOINT_CARPETA_BASE`. Permiso Graph: `Sites.ReadWrite.All`.
- Aprobación por Teams: `APPROVALS_FLOW_URL` = URL del trigger HTTP de un flujo de Power Automate que recibe `{aprobadorEmail, titulo, liquidacionId, liquidacionName}` y crea el Teams Approval.
- D365 FO (Dynamics): `FO_BASE_URL`, `FO_SCOPE` (+ el servicio X++ expuesto). **Se deja para el final.**

Recomendación de orden para probar: OCR → Entra (aprobadores) → SharePoint → correo entrante → Teams → (al final) Dynamics.

## Fase C — Despliegue a Azure (cuando la Fase B esté validada)

- Backend: Azure App Service (Node 20). Variables de entorno = las del `.env`. `npm run build` y `npm start`.
- Base de datos: Azure Database for PostgreSQL Flexible Server. `DATABASE_URL` con `sslmode=require`. Correr `prisma migrate deploy` y `prisma db seed` una vez.
- Frontend: build estático (`cd frontend && npm run build`) servido en Azure Static Web Apps o el propio App Service. Definir `VITE_API_URL` con la URL pública del backend.
- Secretos en Key Vault; identidad administrada para Graph/FO cuando se pueda.

## Qué necesito de tu parte

- Para la Fase A: nada externo (solo tu máquina con Docker).
- GitHub: creá un repo vacío y te paso los comandos para subir el código (`git init`, `git remote add`, `git push`). El `.gitignore` ya excluye `node_modules`, `dist`, `.env`.
- Azure/M365 (Fase B/C): app registration en Entra con los permisos de arriba (con consentimiento de admin), recurso de Document Intelligence, el site/carpeta de SharePoint, el buzón de facturación y el flujo de Power Automate. A medida que los tengas, me pasás los valores (o los ponés en el `.env`) y los vamos activando.

Nota: nunca subas el `.env` con secretos al repo ni me pegues secretos en el chat sin necesidad; alcanza con que los pongas en el `.env` local o en las App Settings de Azure.
