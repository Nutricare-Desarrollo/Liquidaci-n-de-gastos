// =====================================================================
//  Composition root (modo real). Cada servicio usa su adapter real si
//  esta configurado; si no, cae a un "fake" para poder encenderlos uno
//  por uno. Postgres (DATABASE_URL) es la unica dependencia obligatoria.
// =====================================================================
import { loadConfig, type AppConfig } from "./config.js";
import { getDb, type Db } from "./db/client.js";
import { PrismaFacturaRepo } from "./db/facturaRepo.js";
import { EntraTokenProvider } from "./adapters/azure/entraToken.js";
import { AzureBlobStorage } from "./adapters/azure/blobStorage.js";
import { SharePointStorage } from "./adapters/azure/sharepointStorage.js";
import { DocIntelligenceOcr } from "./adapters/azure/docIntelligenceOcr.js";
import { GraphCorreoAdapter } from "./adapters/azure/graphCorreo.js";
import { GraphUsuarios } from "./adapters/azure/graphUsuarios.js";
import { EntraAuth } from "./adapters/azure/entraAuth.js";
import { EntraJwtAuth } from "./adapters/azure/entraJwtAuth.js";
import { FoHttpClient } from "./adapters/finance/foHttpClient.js";
import { TeamsAprobacionNotificacion } from "./adapters/azure/teamsAprobacion.js";
import { DbUsuarios } from "./adapters/dbUsuarios.js";
import { FakeOcr, FakeStorage, FakeFinance, FakeNotificacion, FakeAuth } from "./adapters/fakes.js";
import { ingestarCorreo, type FacturaRepo } from "./services/ingestaFactura.js";
import type { AuthPort, FinancePort, NotificacionPort, OcrPort, StoragePort, UsuariosPort } from "./ports/index.js";

export interface CorreoJob { poll(): Promise<{ procesados: number }>; }

export interface Deps {
  config?: AppConfig; demo: boolean; db: Db;
  ocr: OcrPort; storage: StoragePort; auth: AuthPort; finance: FinancePort;
  notificacion: NotificacionPort; usuarios: UsuariosPort; correo: CorreoJob; facturaRepo: FacturaRepo;
}

export function buildDeps(): Deps {
  const config = loadConfig();
  const db = getDb();
  const modos: string[] = [];

  const entraOk = !!(config.entra.tenantId && config.entra.clientId && config.entra.clientSecret);
  const tokens = entraOk
    ? new EntraTokenProvider({ tenantId: config.entra.tenantId, clientId: config.entra.clientId, clientSecret: config.entra.clientSecret })
    : null;

  // Storage
  let storage: StoragePort;
  if (config.storage.provider === "sharepoint" && tokens && config.storage.sharepoint.siteId) {
    storage = new SharePointStorage({ siteId: config.storage.sharepoint.siteId, driveId: config.storage.sharepoint.driveId || undefined, carpetaBase: config.storage.sharepoint.carpetaBase }, tokens);
    modos.push("storage=sharepoint");
  } else if (config.storage.containerSasUrl) {
    storage = new AzureBlobStorage(config.storage.containerSasUrl); modos.push("storage=blob");
  } else { storage = new FakeStorage(); modos.push("storage=FAKE"); }

  // OCR
  const ocr: OcrPort = (config.ocr.endpoint && config.ocr.apiKey)
    ? (modos.push("ocr=docintelligence"), new DocIntelligenceOcr({ endpoint: config.ocr.endpoint, apiKey: config.ocr.apiKey }))
    : (modos.push("ocr=FAKE"), new FakeOcr());

  // Usuarios (aprobadores)
  const usuarios: UsuariosPort = tokens
    ? (modos.push("usuarios=entra"), new GraphUsuarios(tokens, config.usuarios))
    : (modos.push("usuarios=db"), new DbUsuarios(db));

  // Notificacion (Teams Approval)
  const notificacion: NotificacionPort = config.notificacion.approvalsFlowUrl
    ? (modos.push("notif=teams"), new TeamsAprobacionNotificacion({ approvalsFlowUrl: config.notificacion.approvalsFlowUrl }))
    : (modos.push("notif=FAKE"), new FakeNotificacion());

  // Finance (D365 FO) - se deja de ultimo
  const finance: FinancePort = (tokens && config.fo.baseUrl && config.fo.scope)
    ? (modos.push("fo=real"), new FoHttpClient({ baseUrl: config.fo.baseUrl, servicePath: config.fo.servicePath, getAccessToken: () => tokens.getToken(config.fo.scope), timeoutMs: config.fo.timeoutMs }))
    : (modos.push("fo=FAKE"), new FakeFinance());

  const auth: AuthPort = config.auth.enabled && config.auth.tenantId && config.auth.apiAudience
    ? (modos.push("auth=entra"), new EntraJwtAuth({ tenantId: config.auth.tenantId, audience: config.auth.apiAudience }))
    : (modos.push("auth=FAKE"), new FakeAuth(config.auth.devRoles));
  const facturaRepo = new PrismaFacturaRepo(db);

  // Correo entrante
  let correo: CorreoJob;
  if (tokens && config.graph.mailboxUserId) {
    const g = new GraphCorreoAdapter(config.graph.mailboxUserId, tokens);
    g.onCorreo((c) => ingestarCorreo(c, { storage, repo: facturaRepo }).then(() => undefined));
    correo = g; modos.push("correo=graph");
  } else { correo = { poll: async () => ({ procesados: 0 }) }; modos.push("correo=FAKE"); }

  console.log(`[deps] modo real. Servicios: ${modos.join(", ")}`);
  return { config, demo: false, db, ocr, storage, auth, finance, notificacion, usuarios, correo, facturaRepo };
}
