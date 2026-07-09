import { useEffect, useState } from "react";
import { api, type Catalogos } from "./api.js";
import { MobileCaptura } from "./Captura.js";
import { Admin } from "./Conta.js";

type Vista = "captura" | "conta";

export function App() {
  const [vista, setVista] = useState<Vista>("captura");
  const [cat, setCat] = useState<Catalogos | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then((h) => setDemo(h.demo)).catch(() =>
      setError("No hay conexion con el API. Levanta el backend (npm run demo)."));
    api.catalogos().then(setCat).catch(() => setError("No se pudieron cargar los catalogos."));
  }, []);

  return (
    <>
      <div className="topbar">
        <span className="logo">N</span>
        <h1>Liquidacion de gastos - Nutricare</h1>
        {demo && <span className="demo">MODO DEMO</span>}
        <div className="switch">
          <button className={vista === "captura" ? "active" : ""} onClick={() => setVista("captura")}>Captura</button>
          <button className={vista === "conta" ? "active" : ""} onClick={() => setVista("conta")}>Contabilidad</button>
        </div>
      </div>
      {error && <div className="msg err" style={{ margin: 16 }}>{error}</div>}
      {!cat ? (
        <div style={{ padding: 24 }}>Cargando...</div>
      ) : vista === "captura" ? (
        <MobileCaptura cat={cat} />
      ) : (
        <Admin cat={cat} />
      )}
    </>
  );
}
