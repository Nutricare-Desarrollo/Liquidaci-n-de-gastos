import { useEffect, useRef, useState } from "react";
import { PROPOSITOS, labelProposito } from "./proposito.js";
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
  const [subvista, setSubvista] = useState<"captura" | "mias">("captura");
  const [proposito, setProposito] = useState("TARJETA_CORPORATIVA");
  const [moneda, setMoneda] = useState("CRC");
  const [aprobadorId, setAprobadorId] = useState(cat.usuarios[1]?.id ?? cat.usuarios[0]?.id ?? "");
  const [centroCostoId, setCentroCostoId] = useState(cat.centrosCosto[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState("");
  const [liqExistente, setLiqExistente] = useState("");
  const [liqs, setLiqs] = useState<Liquidacion[]>([]);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [xml, setXml] = useState("");
  // Regimen simplificado (datos que llena el empleado en el telefono)
  const [rMonto, setRMonto] = useState("");
  const [rFecha, setRFecha] = useState("");
  const [rComer, setRComer] = useState("");
  const [rSit, setRSit] = useState("EXENTO");
  const [rNumFac, setRNumFac] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => { api.listar().then(setLiqs).catch(() => {}); }, []);
  useEffect(() => { getFotoUrl().then(setFotoUrl).catch(() => setFotoUrl(null)); }, []);
  const iniciales = (empleado?.nombre ?? "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NN";
  const cats = cat.categorias.filter((c) => c.empresa === empresa);
  const aprobadores = (selfApproval ? cat.usuarios : cat.usuarios.filter((u) => u.id !== empleado?.id))
    .filter((u) => !u.empresa || u.empresa === empresa || u.aprobadorGlobal);
  useEffect(() => { if (aprobadorId === empleado?.id || !aprobadores.some((u) => u.id === aprobadorId)) setAprobadorId(aprobadores[0]?.id ?? ""); }, [empleado?.id]);
  useEffect(() => {
    const validos = cat.centrosCosto.filter((c) => !c.empresa || c.empresa === empresa);
    if (!validos.some((c) => c.id === centroCostoId)) setCentroCostoId(validos[0]?.id ?? "");
  }, [empresa]);

  async function enviar() {
    setMsg(null);
    if (!categoriaId) return setMsg({ t: "err", x: "Elegi la categoria del gasto." });
    if (tipo === "regimen" && !fotoFile) return setMsg({ t: "err", x: "Subi la foto del comprobante (regimen simplificado)." });
    if (tipo === "regimen" && (!(Number(rMonto) > 0) || !rFecha || !rComer.trim())) return setMsg({ t: "err", x: "Completa monto, fecha y comerciante del gasto de regimen." });
    if (tipo === "electronica" && !fotoFile) return setMsg({ t: "err", x: "Subi la foto del comprobante." });
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

      // Regimen simplificado: el empleado llena los datos y se crea el GASTO directo
      // en la liquidacion, con la foto adjunta (sin OCR ni cruce).
      if (tipo === "regimen") {
        const img = await fileToImagen(fotoFile!);
        await api.crearCaptura({ correoEmpleado: empleado?.email, imagenBase64: img.base64, mimeType: img.mimeType, categoriaId, liquidacionId: liqId, esRegimen: true,
          monto: Number(rMonto), fecha: rFecha, comerciante: rComer, situacionFiscal: rSit, numeroFactura: rNumFac || undefined });
        setMsg({ t: "ok", x: `Gasto de regimen creado en la liquidacion ${liqName}.` });
        setFotoFile(null); setRMonto(""); setRFecha(""); setRComer(""); setRNumFac("");
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
        const img = await fileToImagen(fotoFile);
        imagenBase64 = img.base64;
        mimeType = img.mimeType;
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
          <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
            <button className="btn-block" style={{ margin: 0, background: subvista === "captura" ? "var(--brand)" : "#b9c4d0" }} onClick={() => setSubvista("captura")}>Nueva captura</button>
            <button className="btn-block" style={{ margin: 0, background: subvista === "mias" ? "var(--brand)" : "#b9c4d0" }} onClick={() => { setSubvista("mias"); api.listar().then(setLiqs).catch(() => {}); }}>Mis liquidaciones</button>
          </div>
          {subvista === "mias" && (
            <div style={{ marginTop: 6 }}>
              {liqs.length === 0 && <p><small className="mono">Aun no tenes liquidaciones.</small></p>}
              {liqs.map((l) => (
                <div key={l.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b>{l.name}</b>
                    <span className={`badge estado-${l.estado}`}>{l.estado}</span>
                  </div>
                  <small className="mono">{labelProposito(l.proposito)} &middot; {l.moneda} &middot; {Number(l.montoInforme ?? 0).toLocaleString("es-CR")} &middot; {l.createdAt ? new Date(l.createdAt).toLocaleDateString("es-CR") : ""}</small>
                </div>
              ))}
            </div>
          )}
          {subvista === "captura" && (<>
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
          {tipo === "regimen" && <>
            <label className="mini-label">Monto</label>
            <input type="number" inputMode="decimal" value={rMonto} onChange={(e) => setRMonto(e.target.value)} placeholder="0.00" />
            <label className="mini-label">Fecha</label>
            <input type="date" value={rFecha} onChange={(e) => setRFecha(e.target.value)} />
            <label className="mini-label">Comerciante</label>
            <input value={rComer} onChange={(e) => setRComer(e.target.value)} placeholder="Nombre del comercio" />
            <label className="mini-label">Situacion fiscal</label>
            <select value={rSit} onChange={(e) => setRSit(e.target.value)}>
              <option value="EXENTO">EXENTO</option>
              <option value="IVA">IVA</option>
              <option value="NO SUJETO">NO SUJETO</option>
            </select>
            <label className="mini-label">Nº de comprobante (opcional)</label>
            <input value={rNumFac} onChange={(e) => setRNumFac(e.target.value)} placeholder="Nº de factura/recibo" />
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
                {cat.centrosCosto.filter((c) => !c.empresa || c.empresa === empresa).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className="mini-label">Liquidacion existente</label>
              <select value={liqExistente} onChange={(e) => setLiqExistente(e.target.value)}>
                <option value="">-- elegir --</option>
                {liqs.filter((l) => ["BORRADOR", "DEVUELTA"].includes(l.estado)).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.moneda} - {l.estado})</option>)}
              </select>
            </>
          )}
          <label className="mini-label">Categoria del gasto</label>
          <Combo options={cats.map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
            value={categoriaId} onChange={setCategoriaId} placeholder="-- elegir categoria --" />
          {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
          <button className="btn-block" disabled={enviando} onClick={enviar}>{enviando && <span className="spinner" />}{enviando ? "Enviando..." : "Enviar comprobante"}</button>
          </>)}
        </div>
        <div className="ph-foot">Pedi siempre la factura a nombre de Nutricare (cedula juridica).</div>
      </div>
    </div>
  );
}

// Comprime/reduce la foto antes de enviarla (celulares sacan fotos de varios MB).
// Reescala a max 1600px y JPEG calidad 0.7. Si no es imagen rasterizable, envia el archivo tal cual.
async function fileToImagen(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    return { base64: await fileToBase64(file), mimeType: file.type || "application/octet-stream" };
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("no se pudo leer la imagen"));
      i.src = url;
    });
    const maxDim = 1600;
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale); h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mimeType: "image/jpeg" };
  } catch {
    // Fallback: si algo falla (ej. HEIC), envia el archivo original.
    return { base64: await fileToBase64(file), mimeType: file.type || "image/jpeg" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("No se pudo leer la imagen"));
    r.onload = () => { const v = String(r.result); resolve(v.slice(v.indexOf(",") + 1)); };
    r.readAsDataURL(file);
  });
}
