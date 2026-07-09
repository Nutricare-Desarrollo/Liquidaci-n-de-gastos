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
  fo: { baseUrl: string; servicePath: string; scope: string };
  notificacion: { approvalsFlowUrl: string };
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
    fo: { baseUrl: opt("FO_BASE_URL"), servicePath: opt("FO_SERVICE_PATH", "/api/services/NTCExpenseGroup/NTCExpenseReportService/createExpenseReport"), scope: opt("FO_SCOPE") },
    notificacion: { approvalsFlowUrl: opt("APPROVALS_FLOW_URL") },
  };
}
