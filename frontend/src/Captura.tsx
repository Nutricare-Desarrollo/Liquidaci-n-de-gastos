import { useEffect, useRef, useState } from "react";
import { api, fotoDemo, type Catalogos, type Liquidacion } from "./api.js";

export function MobileCaptura({ cat }: { cat: Catalogos }) {
  const empleado = cat.usuarios[0];
  const [empresa, setEmpresa] = useState("ntc");
  const [nueva, setNueva] = useState(true);
  const [proposito, setProposito] = useState("TARJETA_CORPORATIVA");
  const [moneda, setMoneda] = useState("CRC");
  const [aprobadorId, setAprobadorId] = useState(cat.usuarios[1]?.id ?? cat.usuarios[0]?.id ?? "");
  const [centroCostoId, setCentroCostoId] = useState(cat.centrosCosto[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState("");
  const [liqExistente, setLiqExistente] = useState("");
  const [liqs, setLiqs] = useState<Liquidacion[]>([]);
  const [fotoNombre, setFotoNombre] = useState("");
  const [xml, setXml] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.listar().then(setLiqs).catch(() => {}); }, []);
  const cats = cat.categorias.filter((c) => c.empresa === empresa);

  async function enviar() {
    setMsg(null);
    if (!categoriaId) return setMsg({ t: "err", x: "Elegi la categoria del gasto." });
    if (!xml.trim()) return setMsg({ t: "err", x: "En demo, pega el XML de la factura para simular la foto." });
    setEnviando(true);
    try {
      let liqId = liqExistente;
      if (nueva) {
        const l = await api.crearLiquidacion({
          empleadoId: empleado?.id, correoEmpleado: empleado?.email,
          empresa, proposito, moneda, centroCostoId, aprobadorId,
        });
        liqId = l.id;
      }
      if (!liqId) throw new Error("Elegi o crea una liquidacion.");
      const ing = await api.ingestarXml(xml);
      const clave = ing.clave;
      if (!clave) throw new Error("El XML no trae clave valida.");
      const texto = `FACTURA ELECTRONICA\nClave: ${clave.replace(/(.{5})/g, "$1 ")}\n${fotoNombre || ""}`;
      await api.crearCaptura({ correoEmpleado: empleado?.email, imagenBase64: fotoDemo(texto), categoriaId, liquidacionId: liqId });
      const cruce = await api.cruce();
      setMsg({ t: "ok", x: `Comprobante enviado. ${cruce.cruzados} gasto(s) creados.` });
      setXml(""); setFotoNombre("");
      api.listar().then(setLiqs).catch(() => {});
    } catch (e) {
      setMsg({ t: "err", x: (e as Error).message ?? "No se pudo enviar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="phone-wrap">
      <div className="phone">
        <div className="ph-head">
          <span className="logo" style={{ background: "#dfe5ec", color: "#12324f" }}>N</span>
          <span className="t">Liquidacion de gastos</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="ntc">ntc</option>
            <option value="feh">feh</option>
          </select>
        </div>
        <div className="ph-body">
          <div className="hello">
            <div className="av">USER</div>
            <div><b>Hola, {empleado?.nombre ?? "empleado"}</b></div>
          </div>
          <div className={`dropzone ${fotoNombre ? "filled" : ""}`} onClick={() => fileRef.current?.click()}>
            <div className="cam">{fotoNombre ? "FOTO OK" : "+ FOTO"}</div>
            <div>{fotoNombre ? fotoNombre : "Clic para agregar foto"}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => setFotoNombre(e.target.files?.[0]?.name ?? "")} />
          <label className="mini-label">(demo) Pega el XML de la factura para simular la foto</label>
          <textarea rows={3} value={xml} onChange={(e) => setXml(e.target.value)} placeholder="<FacturaElectronica>...</FacturaElectronica>" />
          <div className="toggle-row">
            <span>Crear nueva liquidacion</span>
            <button className={`toggle ${nueva ? "on" : ""}`} onClick={() => setNueva(!nueva)} aria-label="toggle"><span className="knob" /></button>
          </div>
          {nueva ? (
            <>
              <label className="mini-label">Selecciona el proposito</label>
              <select value={proposito} onChange={(e) => setProposito(e.target.value)}>
                <option value="TARJETA_CORPORATIVA">TARJETA CORPORATIVA</option>
                <option value="CAJA_CHICA">CAJA CHICA</option>
                <option value="FONDOS_PERSONALES">PAGO CON FONDOS PERSONALES</option>
              </select>
              <label className="mini-label">Selecciona la moneda del informe</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                <option value="CRC">Colones (CRC)</option>
                <option value="USD">Dolares (USD)</option>
              </select>
              <label className="mini-label">Selecciona el aprobador</label>
              <select value={aprobadorId} onChange={(e) => setAprobadorId(e.target.value)}>
                {cat.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre ?? u.email}</option>)}
              </select>
              <label className="mini-label">Selecciona el centro de costo</label>
              <select value={centroCostoId} onChange={(e) => setCentroCostoId(e.target.value)}>
                {cat.centrosCosto.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className="mini-label">Liquidacion existente</label>
              <select value={liqExistente} onChange={(e) => setLiqExistente(e.target.value)}>
                <option value="">-- elegir --</option>
                {liqs.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.moneda} - {l.estado})</option>)}
              </select>
            </>
          )}
          <label className="mini-label">Categoria del gasto</label>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">-- elegir --</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
          <button className="btn-block" disabled={enviando} onClick={enviar}>{enviando ? "Enviando..." : "Enviar comprobante"}</button>
        </div>
        <div className="ph-foot">Pedi siempre la factura a nombre de Nutricare (cedula juridica).</div>
      </div>
    </div>
  );
}
