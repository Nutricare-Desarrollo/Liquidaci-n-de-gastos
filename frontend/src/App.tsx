import { useEffect, useState } from "react";
import { api, setTokenProvider, type Catalogos, type Sesion } from "./api.js";
import { MobileCaptura } from "./Captura.js";
import { Admin } from "./Conta.js";
import { BrandLogo } from "./BrandLogo.js";
import { authEnabled, login, logout, getToken, cuentaActual } from "./auth.js";

type Vista = "captura" | "conta";

function rolLabel(rol?: string): string {
  return rol === "admin" ? "Administrador" : rol === "conta" ? "Contabilidad" : "Usuario";
}

export function App() {
  const initialLiq = new URLSearchParams(window.location.search).get("liq");
  const [vista, setVista] = useState<Vista>(initialLiq ? "conta" : "captura");
  const [cat, setCat] = useState<Catalogos | null>(null);
  const [demo, setDemo] = useState(false);
  const [selfApproval, setSelfApproval] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [necesitaLogin, setNecesitaLogin] = useState(false);

  useEffect(() => {
    (async () => {
      if (authEnabled) {
        setTokenProvider(getToken);
        const acct = await cuentaActual();
        if (!acct) { setNecesitaLogin(true); return; }
      }
      cargar();
    })();
  }, []);

  function cargar() {
    api.health().then((h) => { setDemo(h.demo); setSelfApproval(!!h.selfApproval); }).catch(() =>
      setError("No hay conexion con el API. Levanta el backend."));
    api.catalogos().then(setCat).catch(() => setError("No se pudieron cargar los catalogos."));
    api.me().then(setSesion).catch(() => setSesion(null));
  }

  async function doLogin() {
    try { await login(); setNecesitaLogin(false); cargar(); }
    catch { setError("No se pudo iniciar sesion."); }
  }
  async function doLogout() { try { await logout(); } finally { window.location.reload(); } }

  const rol = sesion?.rol ?? "estandar";
  const puedeConta = rol === "conta" || rol === "admin";
  useEffect(() => { if (!puedeConta && vista === "conta") setVista("captura"); }, [puedeConta, vista]);

  if (necesitaLogin) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <span className="login-logo"><BrandLogo /></span>
          <h2>Liquidacion de gastos</h2>
          <p>Inicia sesion con tu cuenta de Nutricare.</p>
          {error && <div className="msg err">{error}</div>}
          <button className="btn-block" onClick={doLogin}>Iniciar sesion con Microsoft</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="msg err" style={{ margin: 16 }}>{error}</div>}
      {!cat ? (
        <div style={{ padding: 24 }}>Cargando...</div>
      ) : vista === "captura" ? (
        <>
          <div className="topbar">
            <span className="logo"><BrandLogo /></span>
            <h1>Liquidacion de gastos - Nutricare</h1>
            {demo && <span className="demo">MODO DEMO</span>}
            {sesion && <span className="user-chip">{sesion.nombre ?? sesion.email} &middot; {rolLabel(rol)}</span>}
            <div className="switch">
              <button className="active">Captura</button>
              {puedeConta && <button onClick={() => setVista("conta")}>Contabilidad</button>}
            </div>
            {authEnabled && <button className="ghost" onClick={doLogout}>Salir</button>}
          </div>
          <MobileCaptura cat={cat} sesion={sesion} selfApproval={selfApproval} />
        </>
      ) : (
        <Admin cat={cat} initialLiqId={initialLiq} demo={demo} vista={vista} setVista={setVista} sesion={sesion} puedeConta={puedeConta} onLogout={authEnabled ? doLogout : undefined} />
      )}
    </>
  );
}
