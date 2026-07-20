// Login con Microsoft Entra (MSAL). El MFA lo exige Entra (Conditional Access).
// Config por variables VITE_*. Si faltan, authEnabled=false y la app corre en modo dev.
// @ts-ignore  -- se instala con `npm install` en /frontend (ver README)
import { PublicClientApplication } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AAD_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined;
const apiScope = import.meta.env.VITE_API_SCOPE as string | undefined;

export const authEnabled = !!(clientId && tenantId && apiScope);

let pca: any = null;
async function getPca(): Promise<any> {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId: clientId!,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await pca.initialize();
    await pca.handleRedirectPromise();
  }
  return pca;
}

export async function cuentaActual(): Promise<{ name?: string; username?: string } | null> {
  if (!authEnabled) return null;
  const p = await getPca();
  return p.getAllAccounts()[0] ?? null;
}

export async function login(): Promise<void> {
  const p = await getPca();
  if (p.getAllAccounts().length === 0) {
    await p.loginPopup({ scopes: [apiScope!] });
  }
}

export async function logout(): Promise<void> {
  const p = await getPca();
  await p.logoutPopup();
}

export async function getFotoUrl(): Promise<string | null> {
  if (!authEnabled) return null;
  const p = await getPca();
  const account = p.getAllAccounts()[0];
  if (!account) return null;
  let token: string;
  try {
    const r = await p.acquireTokenSilent({ account, scopes: ["User.Read"] });
    token = r.accessToken;
  } catch { return null; }
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch { return null; }
}

export async function getToken(): Promise<string | null> {
  if (!authEnabled) return null;
  const p = await getPca();
  const account = p.getAllAccounts()[0];
  if (!account) return null;
  try {
    const r = await p.acquireTokenSilent({ account, scopes: [apiScope!] });
    return r.accessToken;
  } catch {
    const r = await p.acquireTokenPopup({ scopes: [apiScope!] });
    return r.accessToken;
  }
}
