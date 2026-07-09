// AuthPort sobre Entra: valida el token del usuario llamando a Graph /me.
// El frontend obtiene el token via MSAL; el backend lo verifica aca.
import type { AuthPort } from "../../ports/index.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

export class EntraAuth implements AuthPort {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async usuarioActual(token: string): Promise<{ id: string; email: string } | null> {
    const res = await this.fetchImpl(`${GRAPH}/me?$select=id,mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const me = (await res.json()) as { id: string; mail?: string; userPrincipalName?: string };
    const email = me.mail ?? me.userPrincipalName ?? "";
    return { id: me.id, email };
  }
}
