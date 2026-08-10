// Configuracion por variables de entorno. DATABASE_URL es lo unico obligatorio
// en modo real; el resto es opcional y activa el servicio real si esta presente.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}
function opt(name: string, def = ""): string { return process.env[name] ?? def; }

export interface AppConfig {
  port: number;
  databaseUrl: string;
  entra: { tenantId: string; clientId: string; clientSecret: string };
  storage: { provider: "blob" | "sharepoint"; containerSasUrl: string; sharepoint: { siteId: string; driveId: string; carpetaBase: string } };
  ocr: { endpoint: string; apiKey: string };
  graph: { mailboxUserId: string };
  fo: { baseUrl: string; servicePath: string; rejectServicePath: string; scope: string; timeoutMs: number };
  notificacion: { approvalsFlowUrl: string; callbackSecret: string };
  app: { baseUrl: string };
  auth: { enabled: boolean; tenantId: string; apiAudience: string; adminRole: string; contaRole: string; devRoles: string[] };
  usuarios: { dominio: string; excluir: string[]; empresaDominios: Record<string, string>; aprobadoresGlobales: string[]; aprobadorGrupos: string[][] };
  permitirAutoaprobacion: boolean;
  correoPollMin: number; // minutos entre polls automaticos del buzon (0 = desactivado)
  correoDesde: string;   // solo procesar correos recibidos desde esta fecha (ISO, ej. 2026-08-10); "" = sin limite
}

// "ntc:nutricare.co.cr;feh:farmacia.co.cr,otra.co.cr" -> { "nutricare.co.cr": "ntc", ... }
function parseEmpresaDominios(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of raw.split(";").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const empresa = part.slice(0, idx).trim().toLowerCase();
    for (const d of part.slice(idx + 1).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) map[d] = empresa;
  }
  return map;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(opt("PORT", "8080")),
    databaseUrl: req("DATABASE_URL"),
    entra: { tenantId: opt("AZURE_TENANT_ID"), clientId: opt("AZURE_CLIENT_ID"), clientSecret: opt("AZURE_CLIENT_SECRET") },
    storage: {
      provider: (opt("STORAGE_PROVIDER", "blob") as "blob" | "sharepoint"),
      containerSasUrl: opt("AZURE_BLOB_CONTAINER_SAS_URL"),
      sharepoint: { siteId: opt("SHAREPOINT_SITE_ID"), driveId: opt("SHAREPOINT_DRIVE_ID"), carpetaBase: opt("SHAREPOINT_CARPETA_BASE", "Comprobantes Gastos") },
    },
    ocr: { endpoint: opt("AZURE_DOCINT_ENDPOINT"), apiKey: opt("AZURE_DOCINT_KEY") },
    graph: { mailboxUserId: opt("GRAPH_MAILBOX_USER_ID") },
    fo: { baseUrl: opt("FO_BASE_URL"), servicePath: opt("FO_SERVICE_PATH", "/api/services/NTCExpenseReportServiceGroup/NTCExpenseReportService/createExpenseReport"), rejectServicePath: opt("FO_REJECT_SERVICE_PATH", "/api/services/NTCExpenseReportServiceGroup/NTCExpenseReportService/rejectExpenseReport"), scope: opt("FO_SCOPE"), timeoutMs: Number(opt("FO_TIMEOUT_MS", "120000")) },
    notificacion: { approvalsFlowUrl: opt("APPROVALS_FLOW_URL"), callbackSecret: opt("APPROVALS_CALLBACK_SECRET") },
    // Base para los enlaces del approval. Si no se define APP_BASE_URL, en Azure
    // se usa el hostname del App Service (WEBSITE_HOSTNAME); en local, localhost.
    app: { baseUrl: opt("APP_BASE_URL") || (process.env["WEBSITE_HOSTNAME"] ? `https://${process.env["WEBSITE_HOSTNAME"]}` : "http://127.0.0.1:5173") },
    auth: {
      enabled: opt("AUTH_ENABLED") === "1",
      tenantId: opt("AZURE_TENANT_ID"),
      apiAudience: opt("API_AUDIENCE"),
      adminRole: opt("ROLE_ADMIN", "Admin"),
      contaRole: opt("ROLE_CONTA", "Contabilidad"),
      devRoles: opt("DEV_ROLES", "Admin").split(",").map((x) => x.trim()).filter(Boolean),
    },
    usuarios: {
      dominio: opt("USUARIOS_DOMINIO", "nutricare.co.cr"),
      excluir: opt("USUARIOS_EXCLUIR", "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
      // Mapea dominio de correo -> empresa (ntc/feh) para filtrar colaboradores.
      // Formato: "ntc:nutricare.co.cr;feh:farmacia.co.cr,otra.co.cr"
      empresaDominios: parseEmpresaDominios(opt("EMPRESA_DOMINIOS", "")),
      // Correos que pueden aprobar informes de CUALQUIER empresa (excepciones: Maricela, Marta...).
      aprobadoresGlobales: opt("APROBADORES_GLOBALES", "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
      // Grupos de aprobadores que se notifican JUNTOS (primero en responder aprueba).
      // Formato: "a@x.com,b@x.com;c@y.com,d@y.com"
      aprobadorGrupos: opt("APROBADOR_GRUPOS", "").split(";").map((g) => g.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)).filter((g) => g.length > 0),
    },
    permitirAutoaprobacion: opt("ALLOW_SELF_APPROVAL") === "1",
    correoPollMin: Number(opt("CORREO_POLL_MIN", "0")),
    correoDesde: opt("CORREO_DESDE", ""),
  };
}
