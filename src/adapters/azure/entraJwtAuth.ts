// AuthPort que valida el access token de Entra localmente:
//  - firma RS256 contra las llaves publicas (JWKS) del tenant
//  - issuer, audience (nuestra API) y expiracion
//  - extrae oid/email/nombre y los App Roles (claim "roles")
// Sin dependencias externas: usa node:crypto + fetch.
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from "node:crypto";
import type { AuthPort, UsuarioAutenticado } from "../../ports/index.js";

interface Jwk extends JsonWebKey { kid?: string; }

function b64urlToBuf(s: string): Buffer {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64");
}
function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(b64urlToBuf(s).toString("utf8")) as Record<string, unknown>;
}

export class EntraJwtAuth implements AuthPort {
  private keys = new Map<string, Jwk>();
  private fetchedAt = 0;
  constructor(private readonly cfg: { tenantId: string; audience: string }, private readonly fetchImpl: typeof fetch = fetch) {}

  private async cargarJwks(force = false): Promise<void> {
    if (!force && this.keys.size && Date.now() - this.fetchedAt < 3_600_000) return;
    const url = `https://login.microsoftonline.com/${this.cfg.tenantId}/discovery/v2.0/keys`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`JWKS ${res.status}`);
    const data = (await res.json()) as { keys: Jwk[] };
    this.keys = new Map(data.keys.filter((k) => k.kid).map((k) => [k.kid as string, k]));
    this.fetchedAt = Date.now();
  }

  async usuarioActual(token: string): Promise<UsuarioAutenticado | null> {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const h = parts[0]!;
    const p = parts[1]!;
    const sig = parts[2]!;
    let header: Record<string, unknown>;
    try { header = b64urlJson(h); } catch { return null; }
    const kid = String(header["kid"] ?? "");

    await this.cargarJwks();
    let jwk = this.keys.get(kid);
    if (!jwk) { await this.cargarJwks(true); jwk = this.keys.get(kid); } // rotacion de llaves
    if (!jwk) return null;

    let ok = false;
    try {
      const key = createPublicKey({ key: jwk, format: "jwk" });
      ok = cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, b64urlToBuf(sig));
    } catch { return null; }
    if (!ok) return null;

    const c = b64urlJson(p);
    const now = Math.floor(Date.now() / 1000);
    if (typeof c["exp"] === "number" && c["exp"] < now - 60) return null;
    if (typeof c["nbf"] === "number" && c["nbf"] > now + 60) return null;

    const iss = String(c["iss"] ?? "");
    const issOk = iss === `https://login.microsoftonline.com/${this.cfg.tenantId}/v2.0`
      || iss === `https://sts.windows.net/${this.cfg.tenantId}/`;
    if (!issOk) return null;

    const audsPermitidas = this.cfg.audience.split(",").map((x) => x.trim()).filter(Boolean);
    const audToken = Array.isArray(c["aud"]) ? (c["aud"] as unknown[]).map(String) : [String(c["aud"] ?? "")];
    const audOk = audToken.some((a) => audsPermitidas.includes(a));
    if (!audOk) return null;

    const id = String(c["oid"] ?? c["sub"] ?? "");
    const email = String(c["preferred_username"] ?? c["upn"] ?? c["email"] ?? "");
    const nombre = c["name"] ? String(c["name"]) : undefined;
    const roles = Array.isArray(c["roles"]) ? (c["roles"] as unknown[]).map(String) : [];
    return { id, email, nombre, roles };
  }
}
