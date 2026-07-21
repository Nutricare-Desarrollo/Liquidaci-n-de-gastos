import { useEffect, useRef, useState } from "react";
import { PROPOSITOS } from "./proposito.js";
import { Combo } from "./Combo.js";
import { api, fotoDemo, type Catalogos, type Liquidacion, type Sesion } from "./api.js";
import { getFotoUrl } from "./auth.js";
import { UsuarioPicker } from "./UsuarioPicker.js";
import { BrandLogo } from "./BrandLogo.js";

export function MobileCaptura({ cat, sesion, selfApproval }: { cat: Catalogos; sesion?: Sesion | null; selfApproval?: boolean }) {
  // Empleado = usuario autenticado (Entra). Fallback al catalogo solo en modo dev sin sesion.
  const empleado = sesion
    ? { id: sesion.id, email: sesion.email, nombre: sesion.nombre ?? sesion.email }
    : cat.usuarios[0];
  const [empresa, setEmpresa] = useState("ntc");
  const [tipo, setTipo] = useState<"electronica" | "regimen">("electronica");
  const [nueva, setNueva] = useState(true);
  const [proposito, setProposito] = useState("TARJETA_CORPORATIVA");
  const [moneda, setMoneda] = useState("CRC");
  const [aprobadorId, setAprobadorId] = useState(cat.usuarios[1]?.id ?? cat.usuarios[0]?.id ?? "");
  const [centroCostoId, setCentroCostoId] = useState(cat.centrosCosto[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState("");
  const [liqExistente, setLiqExistente] = useState("");
  const [liqs, setLiqs] = useState<Liquidacion[]>([]);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [xml, setXml] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => { api.listar().then(setLiqs).catch(() => {}); }, []);
  useEffect(() => { getFotoUrl().then(setFotoUrl).catch(() => setFotoUrl(null)); }, []);
  const iniciales = (empleado?.nombre ?? "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NN";
  const cats = cat.categorias.filter((c) => c.empresa === empresa);
  const aprobadores = selfApproval ? cat.usuarios : cat.usuarios.filter((u) => u.id !== empleado?.id);
  useEffect(() => { if (aprobadorId === empleado?.id || !aprobadores.some((u) => u.id === aprobadorId)) setAprobadorId(aprobadores[0]?.id ?? ""); }, [empleado?.id]);

  async function enviar() {
    setMsg(null);
    if (!categoriaId) return setMsg({ t: "err", x: "Elegi la categoria del gasto." });
    if (tipo === "regimen" && !fotoFile) return setMsg({ t: "err", x: "Subi la foto del comprobante (regimen simplificado)." });
    if (tipo === "electronica" && !fotoFile && !xml.trim()) return setMsg({ t: "err", x: "Subi una foto del comprobante o pega el XML." });
    if (nueva && !aprobadorId) return setMsg({ t: "err", x: "Elegi un aprobador (distinto a vos)." });
    setEnviando(true);
    try {
      // 1) liquidacion (nueva o existente)
      let liqId = liqExistente;
      let liqName = liqs.find((x) => x.id === liqExistente)?.name ?? "";
      if (nueva) {
        const l = await api.crearLiquidacion({
          empleadoId: empleado?.id, correoEmpleado: empleado?.email,
          empresa, proposito, moneda, centroCostoId, aprobadorId,
        });
        liqId = l.id; liqName = l.name;
      }
      if (!liqId) throw new Error("Elegi o crea una liquidacion.");

      // Regimen simplificado: sube la foto SIN OCR ni cruce; contabilidad la convierte en gasto.
      if (tipo === "regimen") {
        const imagenBase64 = await fileToBase64(fotoFile!);
        await api.crearCaptura({ correoEmpleado: empleado?.email, imagenBase64, mimeType: fotoFile!.type || "image/jpeg", categoriaId, liquidacionId: liqId, esRegimen: true });
        setMsg({ t: "ok", x: `Comprobante de regimen enviado a la liquidacion ${liqName}. Contabilidad lo convertira en gasto.` });
        setFotoFile(null);
        api.listar().then(setLiqs).catch(() => {});
        return;
      }

      // 2) si se pega el XML, se ingesta (en produccion llega por correo)
      let claveXml: string | undefined;
      if (xml.trim()) {
        const ing = await api.ingestarXml(xml);
        claveXml = ing.clave;
      }

      // 3) imagen: si hay foto real, se envia la imagen (el OCR lee el QR/clave);
      //    si no hay foto, se simula con la clave del XML (util sin OCR real).
      let imagenBase64: string;
      let mimeType = "image/jpeg";
      if (fotoFile) {
        imagenBase64 = await fileToBase64(fotoFile);
        mimeType = fotoFile.type || "image/jpeg";
      } else {
        if (!claveXml) throw new Error("Subi una foto o pega un XML con clave valida.");
        imagenBase64 = fotoDemo(`FACTURA ELECTRONICA\nClave: ${claveXml.replace(/(.{5})/g, "$1 ")}`);
        mimeType = "text/plain";
      }
      const capt = await api.crearCaptura({ correoEmpleado: empleado?.email, imagenBase64, mimeType, categoriaId, liquidacionId: liqId });

      // 4) cruce
      const cruce = await api.cruce();
      const aviso = (capt as { avisoOcr?: string }).avisoOcr ? ` (${(capt as { avisoOcr?: string }).avisoOcr})` : "";
      setMsg({ t: "ok", x: `Comprobante enviado a la liquidacion ${liqName}.${aviso} ${cruce.cruzados} gasto(s) creados.` });
      setXml(""); setFotoFile(null);
      api.listar().then(setLiqs).catch(() => {});
    } catch (e) {
      const body = (e as { body?: { error?: string; errores?: string[] } }).body;
      const detalle = body?.error ?? body?.errores?.join(" | ") ?? (e as Error).message;
      setMsg({ t: "err", x: detalle ?? "No se pudo enviar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="phone-wrap">
      <div className="phone">
        <div className="ph-head">
          <span className="logo" style={{ background: "#dfe5ec", color: "#0F6A93" }}><BrandLogo /></span>
          <span className="t">Liquidacion de gastos</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="ntc">ntc</option>
            <option value="feh">feh</option>
          </select>
        </div>
        <div className="ph-body">
          <div className="hello">
            <div className="av">{fotoUrl ? <img src={fotoUrl} alt="" /> : iniciales}</div>
            <div><b>Hola, {empleado?.nombre ?? "empleado"}</b></div>
          </div>
          <label className="mini-label">Tipo de comprobante</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "electronica" | "regimen")}>
            <option value="electronica">Factura electronica (con clave)</option>
            <option value="regimen">Regimen simplificado (sin factura)</option>
          </select>
          <div className={`dropzone ${fotoFile ? "filled" : ""}`} onClick={() => fileRef.current?.click()}>
            <div className="cam">{fotoFile ? "FOTO OK" : "+ FOTO"}</div>
            <div>{fotoFile ? fotoFile.name : "Clic para agregar foto"}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)} />
          {tipo === "electronica" && <>
            <label className="mini-label">(opcional) Pega el XML de la factura para la prueba</label>
            <textarea rows={3} value={xml} onChange={(e) => setXml(e.target.value)} placeholder="<FacturaElectronica>...</FacturaElectronica>" />
          </>}
          <div className="toggle-row">
            <span>Crear nueva liquidacion</span>
            <button className={`toggle ${nueva ? "on" : ""}`} onClick={() => setNueva(!nueva)} aria-label="toggle"><span className="knob" /></button>
          </div>
          {nueva ? (
            <>
              <label className="mini-label">Selecciona el proposito</label>
              <select value={proposito} onChange={(e) => setProposito(e.target.value)}>
                {PROPOSITOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <label className="mini-label">Selecciona la moneda del informe</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                <option value="CRC">Colones (CRC)</option>
                <option value="USD">Dolares (USD)</option>
              </select>
              <label className="mini-label">Selecciona el aprobador</label>
              <UsuarioPicker usuarios={aprobadores} value={aprobadorId} onChange={setAprobadorId} />
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
          <Combo options={cats.map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
            value={categoriaId} onChange={setCategoriaId} placeholder="-- elegir categoria --" />
          {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
          <button className="btn-block" disabled={enviando} onClick={enviar}>{enviando && <span className="spinner" />}{enviando ? "Enviando..." : "Enviar comprobante"}</button>
        </div>
        <div className="ph-foot">Pedi siempre la factura a nombre de Nutricare (cedula juridica).</div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("No se pudo leer la imagen"));
    r.onload = () => { const v = String(r.result); resolve(v.slice(v.indexOf(",") + 1)); };
    r.readAsDataURL(file);
  });
}
