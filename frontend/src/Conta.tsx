import { useEffect, useState } from "react";
import { api, type Catalogos, type FacturaSinCruzar, type Gasto, type Liquidacion } from "./api.js";

type Seccion = "liquidaciones" | "gastos" | "capturas" | "facturas" | "reglas";

export function Admin({ cat }: { cat: Catalogos }) {
  const [seccion, setSeccion] = useState<Seccion>("liquidaciones");
  const [liqId, setLiqId] = useState<string | null>(null);
  const [gastoId, setGastoId] = useState<string | null>(null);
  const nav = (s: Seccion) => { setSeccion(s); setLiqId(null); setGastoId(null); };
  return (
    <div className="admin">
      <aside className="side">
        <div className="grp">Operacion</div>
        <a className={seccion === "liquidaciones" ? "active" : ""} onClick={() => nav("liquidaciones")}>Liquidaciones</a>
        <a className={seccion === "gastos" ? "active" : ""} onClick={() => nav("gastos")}>Gastos</a>
        <a className={seccion === "capturas" ? "active" : ""} onClick={() => nav("capturas")}>Capturas</a>
        <a className={seccion === "facturas" ? "active" : ""} onClick={() => nav("facturas")}>Facturas</a>
        <a className={seccion === "reglas" ? "active" : ""} onClick={() => nav("reglas")}>Regla montos</a>
      </aside>
      <main className="content">
        {seccion === "liquidaciones" && !liqId && <LiquidacionesList cat={cat} onOpen={setLiqId} />}
        {seccion === "liquidaciones" && liqId && !gastoId && (
          <LiquidacionForm id={liqId} cat={cat} onBack={() => setLiqId(null)} onGasto={setGastoId} />
        )}
        {seccion === "liquidaciones" && liqId && gastoId && (
          <GastoForm liqId={liqId} gastoId={gastoId} cat={cat} onBack={() => setGastoId(null)} />
        )}
        {seccion === "gastos" && <GenericList titulo="Gastos activos" cargar={api.gastos} cols={["name", "comerciante", "montoTotal", "moneda", "tipoComprobante", "situacionFiscal"]} />}
        {seccion === "capturas" && <GenericList titulo="Capturas activas" cargar={api.capturas} cols={["name", "correoEmpleado", "estado", "clave"]} />}
        {seccion === "facturas" && <GenericList titulo="Facturas activas" cargar={api.facturas} cols={["clave", "emisorNombre", "totalComprobante", "situacionFiscal", "estado"]} />}
        {seccion === "reglas" && <GenericList titulo="Reglas de monto" cargar={api.reglasMonto} cols={["categoriaCodigo", "montoMaxCRC", "montoMaxUSD", "activo"]} />}
      </main>
    </div>
  );
}

function LiquidacionesList({ cat, onOpen }: { cat: Catalogos; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Liquidacion[]>([]);
  const [estado, setEstado] = useState("");
  const [crear, setCrear] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [empId, setEmpId] = useState(cat.usuarios[0]?.id ?? "");
  const [empresa, setEmpresa] = useState("ntc");
  const [proposito, setProposito] = useState("TARJETA_CORPORATIVA");
  const [moneda, setMoneda] = useState("CRC");
  const [ccId, setCcId] = useState(cat.centrosCosto[0]?.id ?? "");
  const [aprId, setAprId] = useState(cat.usuarios[1]?.id ?? cat.usuarios[0]?.id ?? "");
  const cargar = () => api.listar(estado || undefined).then(setRows).catch(() => {});
  useEffect(() => { cargar(); }, [estado]);

  async function crearLiq() {
    setMsg(null);
    const emp = cat.usuarios.find((u) => u.id === empId);
    try {
      const l = await api.crearLiquidacion({ empleadoId: empId, correoEmpleado: emp?.email, empresa, proposito, moneda, centroCostoId: ccId, aprobadorId: aprId });
      setCrear(false); onOpen(l.id);
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  return (
    <>
      <div className="listbar">
        <h2>Liquidaciones activo</h2><span className="caret">v</span>
        <div className="toolbar">
          <button className="primary" onClick={() => setCrear(!crear)}>+ Nueva liquidacion</button>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 180 }}>
            <option value="">Todas</option>
            {["BORRADOR", "ENVIADA", "EN_REVISION_CONTA", "APROBADA", "POSTEADA", "DEVUELTA"].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      {crear && (
        <div className="section">
          <h3><span className="ico">+</span> Nueva liquidacion (a nombre de un empleado)</h3>
          <p><small className="mono">Para conta/asistentes que registran gastos de otras personas, sin usar la app del telefono.</small></p>
          <div className="fields">
            <div className="field"><label>Empleado</label>
              <select value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {cat.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre ?? u.email}</option>)}
              </select></div>
            <div className="field"><label>Empresa</label>
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="ntc">NTC</option><option value="feh">FEH</option></select></div>
            <div className="field"><label>Proposito</label>
              <select value={proposito} onChange={(e) => setProposito(e.target.value)}>
                <option value="TARJETA_CORPORATIVA">TARJETA CORPORATIVA</option><option value="CAJA_CHICA">CAJA CHICA</option><option value="FONDOS_PERSONALES">PAGO CON FONDOS PERSONALES</option>
              </select></div>
            <div className="field"><label>Moneda del informe</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}><option value="CRC">Colones (CRC)</option><option value="USD">Dolares (USD)</option></select></div>
            <div className="field"><label>Centro de costo</label>
              <select value={ccId} onChange={(e) => setCcId(e.target.value)}>{cat.centrosCosto.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Aprobador</label>
              <select value={aprId} onChange={(e) => setAprId(e.target.value)}>{cat.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre ?? u.email}</option>)}</select></div>
          </div>
          <div className="actions"><button className="primary" onClick={crearLiq}>Crear y abrir</button><button className="ghost" onClick={() => setCrear(false)}>Cancelar</button></div>
        </div>
      )}
      <div className="grid">
        <table>
          <thead><tr><th>Name</th><th>Fecha de creacion</th><th>Correo empleado</th><th>Moneda</th><th>Estado</th><th>Proposito</th><th className="num">Monto</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => onOpen(l.id)}>
                <td className="pill-link">{l.name}</td><td>{fdate(l.createdAt)}</td><td>{l.correoEmpleado}</td>
                <td>{l.moneda}</td><td><span className={`badge estado-${l.estado}`}>{l.estado}</span></td>
                <td>{propo(l.proposito)}</td><td className="num">{fmt(l.montoInforme)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7}>Sin liquidaciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LiquidacionForm({ id, cat, onBack, onGasto }: { id: string; cat: Catalogos; onBack: () => void; onGasto: (gastoId: string) => void; }) {
  const [liq, setLiq] = useState<Liquidacion | null>(null);
  const [comentario, setComentario] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [modo, setModo] = useState<"" | "factura" | "simple">("");
  const [facturas, setFacturas] = useState<FacturaSinCruzar[]>([]);
  const [facturaId, setFacturaId] = useState("");
  const [catId, setCatId] = useState("");
  // regimen simplificado
  const [sMonto, setSMonto] = useState(""); const [sFecha, setSFecha] = useState("");
  const [sComer, setSComer] = useState(""); const [sSit, setSSit] = useState("IVA"); const [sCc, setSCc] = useState("");

  const cargar = () => api.detalle(id).then(setLiq).catch(() => setMsg({ t: "err", x: "No se pudo cargar." }));
  const cargarFacturas = () => api.facturasSinCruzar().then(setFacturas).catch(() => {});
  useEffect(() => { cargar(); cargarFacturas(); }, [id]);

  async function accion(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ t: "ok", x: ok }); await cargar(); await cargarFacturas(); } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  if (!liq) return <div className="section">Cargando...</div>;
  const cc = cat.centrosCosto.find((c) => c.id === liq.centroCostoId)?.name ?? "-";
  const apr = cat.usuarios.find((u) => u.id === liq.aprobadorId)?.nombre ?? "-";
  const cats = cat.categorias.filter((c) => c.empresa === liq.empresa);
  const editable = liq.estado === "BORRADOR" || liq.estado === "DEVUELTA";

  async function agregarFactura() {
    if (!facturaId || !catId) return setMsg({ t: "err", x: "Elegi factura y categoria." });
    await accion(() => api.crearGastoManual(id, facturaId, catId), "Gasto agregado desde la factura.");
    setFacturaId(""); setCatId(""); setModo("");
  }
  async function agregarSimple() {
    if (!sMonto || !sFecha || !sComer || !catId) return setMsg({ t: "err", x: "Completa monto, fecha, comerciante y categoria." });
    await accion(() => api.crearGastoSimplificado(id, { monto: Number(sMonto), fecha: sFecha, comerciante: sComer, categoriaId: catId, situacionFiscal: sSit, centroCostoId: sCc || null }), "Gasto de regimen simplificado agregado.");
    setSMonto(""); setSFecha(""); setSComer(""); setSCc(""); setCatId(""); setModo("");
  }
  async function enviarInforme() {
    setMsg(null);
    try {
      const r = await api.enviar(id);
      const extra = r.aprobadorNotificado ? ` Se envio la aprobacion (Teams) a ${r.aprobadorNotificado}.` : "";
      setMsg({ t: "ok", x: "Informe enviado." + extra });
      await cargar(); await cargarFacturas();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  return (
    <>
      <span className="crumb" onClick={onBack}>&larr; Liquidaciones</span>
      <div className="form-head">
        <span className="title">{liq.name}</span>
        <span className={`badge estado-${liq.estado}`}>{liq.estado}</span>
        <div className="meta">
          <div>Empresa<b>{liq.empresa.toUpperCase()}</b></div>
          <div>Moneda<b>{liq.moneda}</b></div>
          <div>Monto informe<b>{fmt(liq.montoInforme)} {liq.moneda}</b></div>
          {liq.numeroReporteFO && <div>Reporte FO<b>{liq.numeroReporteFO}</b></div>}
        </div>
      </div>
      {liq.comentarioConta && <div className="msg err">Devuelta: {liq.comentarioConta}</div>}
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}

      <div className="section">
        <h3><span className="ico">#</span> Informacion general</h3>
        <div className="fields">
          <Field label="Nombre" v={liq.name} /><Field label="Proposito" v={propo(liq.proposito)} />
          <Field label="Centro costo" v={cc} /><Field label="Correo empleado" v={liq.correoEmpleado} />
          <Field label="Moneda del informe" v={liq.moneda} /><Field label="Monto informe" v={`${fmt(liq.montoInforme)} ${liq.moneda}`} />
          <Field label="Aprobador" v={apr} /><Field label="Ultima actualizacion" v={fdate(liq.updatedAt)} />
        </div>
      </div>

      <div className="section">
        <div className="listbar" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><span className="ico">$</span> Detalle de gastos</h3>
          <div className="toolbar">
            {editable && <button className="ghost" onClick={() => setModo(modo === "factura" ? "" : "factura")}>+ Desde factura</button>}
            {editable && <button className="ghost" onClick={() => setModo(modo === "simple" ? "" : "simple")}>+ Regimen simplificado</button>}
            <button className="ghost" onClick={cargar}>Actualizar</button>
          </div>
        </div>

        {modo === "factura" && editable && (
          <div className="section" style={{ background: "#f7f9fb" }}>
            <div className="fields">
              <div className="field"><label>Factura no cruzada</label>
                <select value={facturaId} onChange={(e) => setFacturaId(e.target.value)}>
                  <option value="">-- elegir factura --</option>
                  {facturas.map((f) => <option key={f.id} value={f.id}>{f.emisorNombre} - {fmt(f.totalComprobante)} ({f.situacionFiscal})</option>)}
                </select></div>
              <div className="field"><label>Categoria</label>
                <select value={catId} onChange={(e) => setCatId(e.target.value)}>
                  <option value="">-- elegir --</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select></div>
            </div>
            <div className="actions">
              <button className="primary" onClick={agregarFactura}>Agregar gasto</button>
              <button className="ghost" onClick={() => setModo("")}>Cancelar</button>
            </div>
            {facturas.length === 0 && <p><small className="mono">No hay facturas sin cruzar disponibles.</small></p>}
          </div>
        )}

        {modo === "simple" && editable && (
          <div className="section" style={{ background: "#f7f9fb" }}>
            <p><small className="mono">Regimen simplificado: proveedor sin factura electronica. Se ingresan los datos a mano.</small></p>
            <div className="fields">
              <div className="field"><label>Monto ({liq.moneda})</label><input type="number" value={sMonto} onChange={(e) => setSMonto(e.target.value)} /></div>
              <div className="field"><label>Fecha</label><input type="date" value={sFecha} onChange={(e) => setSFecha(e.target.value)} /></div>
              <div className="field"><label>Comerciante</label><input value={sComer} onChange={(e) => setSComer(e.target.value)} placeholder="Nombre del proveedor" /></div>
              <div className="field"><label>Categoria</label>
                <select value={catId} onChange={(e) => setCatId(e.target.value)}>
                  <option value="">-- elegir --</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select></div>
              <div className="field"><label>Situacion fiscal</label>
                <select value={sSit} onChange={(e) => setSSit(e.target.value)}>
                  <option value="IVA">IVA</option><option value="EXENTO">EXENTO</option><option value="NO SUJETO">NO SUJETO</option>
                </select></div>
              <div className="field"><label>Centro de costo</label>
                <select value={sCc} onChange={(e) => setSCc(e.target.value)}>
                  <option value="">(del informe)</option>
                  {cat.centrosCosto.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            <div className="actions">
              <button className="primary" onClick={agregarSimple}>Agregar gasto simplificado</button>
              <button className="ghost" onClick={() => setModo("")}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="grid">
          <table>
            <thead><tr><th>Fecha</th><th>Comerciante</th><th>Categoria</th><th>Tipo</th><th>Situacion</th><th className="num">Monto</th><th>Alerta</th></tr></thead>
            <tbody>
              {(liq.gastos ?? []).map((g) => (
                <tr key={g.id} onClick={() => onGasto(g.id)}>
                  <td>{fdate(g.fecha)}</td>
                  <td className="pill-link">{g.comerciante}{g.gastoOrigenId ? " (division)" : ""}</td>
                  <td>{g.categoria?.nombre ?? "-"}</td>
                  <td>{tipoComp(g.tipoComprobante)}</td>
                  <td>{g.situacionFiscal}</td>
                  <td className="num">{fmt(g.montoTotal)} {g.moneda}</td>
                  <td>{g.excedeLimite ? <span className="alerta">EXCEDE</span> : "OK"}</td>
                </tr>
              ))}
              {(liq.gastos ?? []).length === 0 && <tr><td colSpan={7}>Sin gastos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3><span className="ico">*</span> Flujo de aprobacion (2 etapas)</h3>
        <p><small className="mono">Orden: 1) el aprobador de la captura, 2) contabilidad (que postea a FO).</small></p>
        <div className="fields" style={{ marginBottom: 10 }}>
          <div className="field"><label>Comentario (para devolver)</label>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Motivo de devolucion" /></div>
        </div>
        <div className="actions">
          <button className="primary" disabled={!editable} onClick={enviarInforme}>Enviar</button>
          <button className="primary" disabled={liq.estado !== "ENVIADA"} onClick={() => accion(() => api.aprobar(id), "Aprobado por el aprobador.")}>1. Aprobar (aprobador)</button>
          <button className="primary" disabled={liq.estado !== "EN_REVISION_CONTA"} onClick={() => accion(() => api.aprobarConta(id), "Aprobado por conta y posteado a FO.")}>2. Aprobar conta -&gt; postear</button>
          <button className="ghost" disabled={!(liq.estado === "ENVIADA" || liq.estado === "EN_REVISION_CONTA")} onClick={() => comentario && accion(() => api.devolver(id, comentario), "Devuelto.")}>Devolver</button>
        </div>
      </div>
    </>
  );
}

function GastoForm({ liqId, gastoId, cat, onBack }: { liqId: string; gastoId: string; cat: Catalogos; onBack: () => void; }) {
  const [g, setG] = useState<Gasto | null>(null);
  const [estadoLiq, setEstadoLiq] = useState("");
  const [grupo, setGrupo] = useState(""); const [ccId, setCcId] = useState(""); const [info, setInfo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [dMonto, setDMonto] = useState(""); const [dCc, setDCc] = useState(""); const [dCat, setDCat] = useState("");
  const [dividir, setDividir] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const cargar = () => api.detalle(liqId).then((l) => {
    setEstadoLiq(l.estado);
    const found = (l.gastos ?? []).find((x) => x.id === gastoId) ?? null;
    setG(found);
    if (found) { setGrupo(found.grupoImpuesto); setCcId(found.centroCostoId ?? ""); setInfo(found.informacionAdicional ?? ""); }
  }).catch(() => {});
  useEffect(() => { cargar(); }, [liqId, gastoId]);
  if (!g) return <div className="section">Cargando...</div>;
  const editable = estadoLiq === "BORRADOR" || estadoLiq === "DEVUELTA";

  async function guardar() {
    setMsg(null);
    try {
      const r = await api.actualizarGasto(gastoId, { grupoImpuesto: grupo, centroCostoId: ccId || null, informacionAdicional: info });
      setMsg(r.errores.length ? { t: "err", x: r.errores.join(" | ") } : { t: "ok", x: "Gasto guardado." });
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  async function subir(file: File) {
    setMsg(null); setSubiendo(true);
    try {
      const b64 = await fileToBase64(file);
      await api.subirAdjunto(gastoId, { nombre: file.name, contenidoBase64: b64, mimeType: file.type || "application/octet-stream" });
      setMsg({ t: "ok", x: "Adjunto subido." });
      await cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); } finally { setSubiendo(false); }
  }
  async function hacerDivision() {
    setMsg(null);
    if (!dMonto || !dCc) return setMsg({ t: "err", x: "Indica monto y centro de costo de la division." });
    try {
      await api.dividirGasto(gastoId, { monto: Number(dMonto), centroCostoId: dCc, categoriaId: dCat || undefined });
      setMsg({ t: "ok", x: "Gasto dividido. Revisa el detalle de la liquidacion." });
      setDMonto(""); setDCc(""); setDCat(""); setDividir(false);
      await cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  return (
    <>
      <span className="crumb" onClick={onBack}>&larr; Detalle de gastos</span>
      <div className="form-head">
        <span className="title">Gasto - {g.comerciante}</span>
        <span className="badge">{tipoComp(g.tipoComprobante)}</span>
        {g.gastoOrigenId && <span className="badge">Division</span>}
        {g.excedeLimite && <span className="alerta">EXCEDE: {g.alerta}</span>}
      </div>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      <div className="section">
        <h3><span className="ico">#</span> Informacion general</h3>
        <div className="fields">
          <Field label="Comerciante" v={g.comerciante} /><Field label="Metodo pago" v={g.metodoPago} />
          <Field label="Categoria" v={g.categoria?.nombre ?? "-"} /><Field label="Fecha gasto" v={fdate(g.fecha)} />
          <div className="field"><label>Grupo impuesto (articulos)</label>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              {cat.gruposImpuesto.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
            </select></div>
          <Field label="Tipo comprobante" v={tipoComp(g.tipoComprobante)} />
        </div>
      </div>
      <div className="section">
        <h3><span className="ico">$</span> Informacion financiera</h3>
        <div className="fields">
          <Field label="Monto total" v={`${fmt(g.montoTotal)} ${g.moneda}`} /><Field label="Tipo de cambio" v="1,00" />
          <Field label="Divisa (del informe)" v={g.moneda} /><Field label="Excede limite" v={g.excedeLimite ? "Si" : "No"} />
          <Field label="Situacion fiscal (venta)" v={g.situacionFiscal} />
          <div className="field"><label>Centro costo</label>
            <select value={ccId} onChange={(e) => setCcId(e.target.value)}>
              <option value="">-</option>{cat.centrosCosto.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div>
        </div>
      </div>
      {(g.litros != null || g.tipoGasolina) && (
        <div className="section">
          <h3><span className="ico">L</span> Informacion del combustible</h3>
          <div className="fields"><Field label="Litros" v={g.litros != null ? String(g.litros) : "-"} /><Field label="Tipo gasolina" v={g.tipoGasolina ?? "-"} /></div>
        </div>
      )}
      <div className="section">
        <h3><span className="ico">+</span> Informacion adicional</h3>
        <div className="fields">
          <Field label="Url PDF" v={g.urlPdf ?? "-"} />
          <div className="field" style={{ gridColumn: "1 / span 2" }}>
            <label>Informacion adicional / justificacion{g.excedeLimite ? " (requerida por exceso)" : ""}</label>
            <input value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Justificacion u observaciones" />
          </div>
        </div>
        <div className="actions"><button className="primary" onClick={guardar}>Guardar gasto</button></div>
      </div>

      <div className="section">
        <h3><span className="ico">@</span> Adjuntos</h3>
        <p><small className="mono">PDF de Hacienda (del correo) e imagenes/PDF cargados a mano. En produccion se guardan en SharePoint.</small></p>
        <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 13 }}>
          {g.urlPdf && <li><a className="pill-link" href={g.urlPdf} target="_blank" rel="noreferrer">PDF de Hacienda</a></li>}
          {(g.adjuntos ?? []).map((a, i) => <li key={i}><a className="pill-link" href={a.url} target="_blank" rel="noreferrer">{a.nombre}</a> <small className="mono">({a.tipo})</small></li>)}
          {!g.urlPdf && (g.adjuntos ?? []).length === 0 && <li><small className="mono">Sin adjuntos.</small></li>}
        </ul>
        <label className="mini-label">Subir imagen o PDF</label>
        <input type="file" accept="image/*,application/pdf" disabled={subiendo}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = ""; }} />
        {subiendo && <p><small className="mono">Subiendo...</small></p>}
      </div>

      {editable && (
        <div className="section">
          <div className="listbar" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}><span className="ico">/</span> Dividir gasto</h3>
            <div className="toolbar"><button className="ghost" onClick={() => setDividir(!dividir)}>{dividir ? "Cancelar" : "Dividir"}</button></div>
          </div>
          <p><small className="mono">Crea un gasto derivado con su propio monto y centro de costo. El original se reduce por ese monto.</small></p>
          {dividir && (
            <>
              <div className="fields">
                <div className="field"><label>Monto a separar ({g.moneda})</label><input type="number" value={dMonto} onChange={(e) => setDMonto(e.target.value)} /></div>
                <div className="field"><label>Centro de costo de la division</label>
                  <select value={dCc} onChange={(e) => setDCc(e.target.value)}>
                    <option value="">-- elegir --</option>{cat.centrosCosto.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select></div>
                <div className="field"><label>Categoria (opcional)</label>
                  <select value={dCat} onChange={(e) => setDCat(e.target.value)}>
                    <option value="">(misma del original)</option>{cat.categorias.filter((c)=>c.empresa===(g.categoria?.empresa ?? "ntc")).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select></div>
              </div>
              <div className="actions"><button className="primary" onClick={hacerDivision}>Crear division</button></div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function GenericList({ titulo, cargar, cols }: { titulo: string; cargar: () => Promise<Record<string, unknown>[]>; cols: string[]; }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { cargar().then(setRows).catch(() => setRows([])); }, [titulo]);
  return (
    <>
      <div className="listbar"><h2>{titulo}</h2><span className="caret">v</span></div>
      <div className="grid">
        <table>
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (<tr key={i}>{cols.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>))}
            {rows.length === 0 && <tr><td colSpan={cols.length}>Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, v }: { label: string; v?: string | number | null }) {
  return <div className="field"><label>{label}</label><div className="val">{v ?? "-"}</div></div>;
}
function fmt(n?: number): string { return (n ?? 0).toLocaleString("es-CR"); }
function fdate(s?: string): string { return s ? new Date(s).toLocaleString("es-CR") : "-"; }
function propo(p: string): string {
  return ({ TARJETA_CORPORATIVA: "TARJETA CORPORATIVA", CAJA_CHICA: "CAJA CHICA", FONDOS_PERSONALES: "FONDOS PERSONALES" } as Record<string, string>)[p] ?? p;
}
function tipoComp(t?: string): string {
  return t === "REGIMEN_SIMPLIFICADO" ? "Regimen simplificado" : "Factura electronica";
}
function cell(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "Si" : "No";
  if (typeof v === "number") return v.toLocaleString("es-CR");
  return String(v);
}
function describe(e: unknown): string {
  const body = (e as { body?: { errores?: string[]; mensaje?: string; error?: string } })?.body;
  if (body?.errores?.length) return body.errores.join(" | ");
  return body?.mensaje ?? body?.error ?? (e as Error)?.message ?? "Error en la operacion.";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.onload = () => { const v = String(r.result); resolve(v.slice(v.indexOf(",") + 1)); };
    r.readAsDataURL(file);
  });
}
