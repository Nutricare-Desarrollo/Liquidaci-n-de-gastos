// UsuariosPort sobre Entra (Microsoft Graph). Lista usuarios habilitados
// para poblar el selector de aprobador. Requiere User.Read.All (app).
import type { UsuarioDir, UsuariosPort } from "../../ports/index.js";
import type { EntraTokenProvider } from "./entraToken.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export class GraphUsuarios implements UsuariosPort {
  constructor(private readonly tokens: EntraTokenProvider, private readonly fetchImpl: typeof fetch = fetch) {}

  async listar(): Promise<UsuarioDir[]> {
    const token = await this.tokens.getToken(GRAPH_SCOPE);
    const url = `${GRAPH}/users?$select=id,displayName,mail,userPrincipalName,employeeId&$filter=accountEnabled eq true&$top=200`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (!res.ok) throw new Error(`Graph users ${res.status}: ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as { value: Array<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string; employeeId?: string }> };
    return data.value
      .map((u) => ({ id: u.id, email: u.mail ?? u.userPrincipalName ?? "", nombre: u.displayName, personnelNumber: u.employeeId }))
      .filter((u) => u.email)
      .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));
  }
}
