// Token OAuth2 client_credentials contra Entra (Azure AD).
// Usado para FO (cuenta de servicio dedicada) y para Microsoft Graph.
// Cachea el token hasta poco antes de expirar.
export interface EntraTokenConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export class EntraTokenProvider {
  private cache = new Map<string, { token: string; exp: number }>();
  constructor(private readonly cfg: EntraTokenConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async getToken(scope: string): Promise<string> {
    const now = Date.now();
    const hit = this.cache.get(scope);
    if (hit && hit.exp - 60_000 > now) return hit.token;

    const url = `https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      grant_type: "client_credentials",
      scope,
    });

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`Entra token ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cache.set(scope, { token: json.access_token, exp: now + json.expires_in * 1000 });
    return json.access_token;
  }
}
