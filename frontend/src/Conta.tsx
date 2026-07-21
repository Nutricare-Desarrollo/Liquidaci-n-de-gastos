import { useEffect, useState } from "react";
import { PROPOSITOS, labelProposito, categoriasPermitidas, esKilometraje, esAnticipos } from "./proposito.js";
import { Combo } from "./Combo.js";
import type { TarifaKm } from "./api.js";
import { api, type Catalogos, type Factura, type FacturaSinCruzar, type Gasto, type Liquidacion, type ReglaMonto, type Sesion } from "./api.js";
import { UsuarioPicker } from "./UsuarioPicker.js";
import { AsyncButton } from "./AsyncButton.js";
import { BrandLogo } from "./BrandLogo.js";

type Seccion = "liquidaciones" | "gastos" | "capturas" | "facturas" | "reglas" | "tarifas";

function rolLabel(rol?: string): string { return rol === "admin" ? "Administrador" : rol === "conta" ? "Contabilidad" : "Usuario"; }

export function Admin({ cat, initialLiqId, demo, vista, setVista, sesion, puedeConta, onLogout }: { cat: Catalogos; initialLiqId?: string | null; demo?: boolean; vista?: string; setVista?: (v: "captura" | "conta") => void; sesion?: Sesion | null; puedeConta?: boolean; onLogout?: () => void }) {
  const [seccion, setSeccion] = useState<Seccion>("liquidaciones");
  const [liqId, setLiqId] = useState<string | null>(initialLiqId ?? null);
  const [gastoId, setGastoId] = useState<string | null>(null);
  const [facturaPrefill, setFacturaPrefill] = useState<string | null>(null);
  const nav = (s: Seccion) => { setSeccion(s); setLiqId(null); setGastoId(null); setFacturaPrefill(null); };
  return (
    <div className="admin">
      <aside className="side">
        <div className="brand">
          <span className="brand-logo"><BrandLogo /></span>
          <div className="brand-sub">LIQUIDACION DE GASTOS</div>
        </div>
        <nav className="nav">
          <div className="grp">Operacion</div>
          <a className={seccion === "liquidaciones" ? "active" : ""} onClick={() => nav("liquidaciones")}>Liquidaciones</a>
          <a className={seccion === "gastos" ? "active" : ""} onClick={() => nav("gastos")}>Gastos</a>
          <a className={seccion === "capturas" ? "active" : ""} onClick={() => nav("capturas")}>Capturas</a>
          <a className={seccion === "facturas" ? "active" : ""} onClick={() => nav("facturas")}>Facturas</a>
          <div className="grp">Configuracion</div>
          <a className={seccion === "reglas" ? "active" : ""} onClick={() => nav("reglas")}>Regla de montos</a>
          <a className={seccion === "tarifas" ? "active" : ""} onClick={() => nav("tarifas")}>Tarifas KM</a>
        </nav>
        <div className="side-foot">
          {sesion && <div className="user-box"><b>{sesion.nombre ?? sesion.email}</b><small className="mono">{rolLabel(sesion.rol)}</small></div>}
          {demo && <span className="demo-badge">MODO DEMO</span>}
          <div className="switch">
            <button className={vista === "captura" ? "active" : ""} onClick={() => setVista?.("captura")}>Captura</button>
            {(puedeConta ?? true) && <button className={vista === "conta" ? "active" : ""} onClick={() => setVista?.("conta")}>Contabilidad</button>}
          </div>
          {onLogout && <button className="ghost" onClick={onLogout}>Cerrar sesion</button>}
        </div>
      </aside>
      <main className="content">
        {seccion === "liquidaciones" && !liqId && <LiquidacionesList cat={cat} onOpen={setLiqId} />}
        {seccion === "liquidaciones" && liqId && !gastoId && (
          <LiquidacionForm id={liqId} cat={cat} onBack={() => setLiqId(null)} onGasto={setGastoId} />
        )}
        {seccion === "liquidaciones" && liqId && gastoId && (
          <GastoForm liqId={liqId} gastoId={gastoId} cat={cat} onBack={() => setGastoId(null)} />
        )}
        {seccion === "gastos" && <GenericList titulo="Gastos activos" cargar={api.gastos} cols={["name", "comerciante", "numeroFactura", "montoTotal", "moneda", "tipoComprobante", "situacionFiscal"]} />}
        {seccion === "capturas" && <CapturasView cat={cat} onCrearFactura={(clave) => { setFacturaPrefill(clave); setSeccion("facturas"); }} />}
        {seccion === "facturas" && <FacturasView prefillClave={facturaPrefill} onConsumePrefill={() => setFacturaPrefill(null)} />}
        {seccion === "reglas" && <ReglasView cat={cat} />}
        {seccion === "tarifas" && <TarifasKmView />}
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
          <AsyncButton className="ghost" onClick={async () => {
            if (!confirm("Esto borra liquidaciones, gastos y capturas, y deja las facturas sin cruzar. Continuar?")) return;
            try { const r = await api.reset(); setMsg({ t: "ok", x: `Datos de prueba reiniciados. ${r.facturasReseteadas} factura(s) liberadas.` }); cargar(); }
            catch (e) { setMsg({ t: "err", x: describe(e) }); }
          }}>Limpiar datos de prueba</AsyncButton>
          <AsyncButton className="ghost" onClick={async () => {
            try { const r = await api.ingestaCorreo(); setMsg({ t: "ok", x: `Correo revisado: ${r.procesados} correo(s) procesados.` }); cargar(); }
            catch (e) { setMsg({ t: "err", x: describe(e) }); }
          }}>Revisar correo</AsyncButton>
          <AsyncButton className="ghost" onClick={async () => {
            try { const r = await api.cruce(); setMsg({ t: "ok", x: `Cruce ejecutado: ${r.cruzados} gasto(s) creados, ${r.sinFactura} sin factura.` }); cargar(); }
            catch (e) { setMsg({ t: "err", x: describe(e) }); }
          }}>Ejecutar cruce</AsyncButton>
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
              <Combo options={cat.usuarios.map((u) => ({ value: u.id, label: u.nombre ?? u.email, hint: u.email }))}
                value={empId} onChange={setEmpId} placeholder="Escribi el nombre..." /></div>
            <div className="field"><label>Empresa</label>
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="ntc">NTC</option><option value="feh">FEH</option></select></div>
            <div className="field"><label>Proposito</label>
              <Combo options={PROPOSITOS} value={proposito} onChange={setProposito} placeholder="Escribi el proposito..." /></div>
            <div className="field"><label>Moneda del informe</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}><option value="CRC">Colones (CRC)</option><option value="USD">Dolares (USD)</option></select></div>
            <div className="field"><label>Centro de costo</label>
              <Combo options={cat.centrosCosto.map((c) => ({ value: c.id, label: c.name }))}
                value={ccId} onChange={setCcId} placeholder="Escribi el centro..." /></div>
            <div className="field"><label>Aprobador</label>
              <UsuarioPicker usuarios={cat.usuarios} value={aprId} onChange={setAprId} /></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={crearLiq} loadingText="Creando...">Crear y abrir</AsyncButton><button className="ghost" onClick={() => setCrear(false)}>Cancelar</button></div>
        </div>
      )}
      <div className="grid">
        <table>
          <thead><tr><th>Name</th><th>Fecha de creacion</th><th>Correo empleado</th><th>Moneda</th><th>Estado</th><th>Proposito</th><th className="num">Monto</th><th>Reporte FO</th></tr></thead>
          <tbody>
            {[...rows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).map((l) => (
              <tr key={l.id} onClick={() => onOpen(l.id)}>
                <td className="pill-link">{l.name}</td><td>{fdate(l.createdAt)}</td><td>{l.correoEmpleado}</td>
                <td>{l.moneda}</td><td><span className={`badge estado-${l.estado}`}>{l.estado}</span></td>
                <td>{propo(l.proposito)}</td><td className="num">{fmt(l.montoInforme)}</td><td>{l.numeroReporteFO ?? "-"}</td>
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
  const [aprId, setAprId] = useState("");
  // regimen simplificado
  const [sMonto, setSMonto] = useState(""); const [sFecha, setSFecha] = useState("");
  const [sComer, setSComer] = useState(""); const [sSit, setSSit] = useState("EXENTO"); const [sCc, setSCc] = useState("");
  const [sZona, setSZona] = useState("GAM"); const [sKm, setSKm] = useState("");
  const [sLitros, setSLitros] = useState(""); const [sTipoGas, setSTipoGas] = useState("");

  const cargar = () => api.detalle(id).then(setLiq).catch(() => setMsg({ t: "err", x: "No se pudo cargar." }));
  const cargarFacturas = () => api.facturasSinCruzar().then(setFacturas).catch(() => {});
  useEffect(() => { cargar(); cargarFacturas(); }, [id]);
  useEffect(() => { if (liq) setAprId(String(liq.aprobadorId ?? "")); }, [liq]);

  async function accion(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ t: "ok", x: ok }); await cargar(); await cargarFacturas(); } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  if (!liq) return <div className="section">Cargando...</div>;
  const cc = cat.centrosCosto.find((c) => c.id === liq.centroCostoId)?.name ?? "-";
  const apr = cat.usuarios.find((u) => u.id === liq.aprobadorId)?.nombre ?? "-";
  const permCod = categoriasPermitidas(liq.proposito);
  const cats = cat.categorias.filter((c) => c.empresa === liq.empresa && (!permCod || permCod.includes(c.codigo)));
  const esCombSel = ["COMBUSTIBLE", "COMBUSTIBLES"].includes(cats.find((c) => c.id === catId)?.codigo ?? "");
  const editable = liq.estado === "BORRADOR" || liq.estado === "DEVUELTA";
  const puedeEditarApr = ["BORRADOR", "DEVUELTA", "ENVIADA"].includes(liq.estado);

  async function agregarFactura() {
    if (!facturaId || !catId) return setMsg({ t: "err", x: "Elegi factura y categoria." });
    await accion(() => api.crearGastoManual(id, facturaId, catId), "Gasto agregado desde la factura.");
    setFacturaId(""); setCatId(""); setModo("");
  }
  async function agregarSimple() {
    if (!sMonto || !sFecha || !sComer || !catId) return setMsg({ t: "err", x: "Completa monto, fecha, comerciante y categoria." });
    if (esCombSel && (!sLitros || !sTipoGas)) return setMsg({ t: "err", x: "Para combustible ingresa litros y tipo de combustible." });
    const esKm = esKilometraje(liq?.proposito ?? "");
    await accion(() => api.crearGastoSimplificado(id, {
      monto: Number(sMonto), fecha: sFecha, comerciante: sComer, categoriaId: catId,
      situacionFiscal: sSit, centroCostoId: sCc || null,
      ...(esKm ? { zona: sZona, kilometros: Number(sKm) || 0 } : {}),
      ...(esCombSel
        ? { litros: Number(sLitros), tipoGasolina: sTipoGas }
        : esKm ? { tipoComprobante: "KILOMETRAJE" } : {}),
    }), esKm && !esCombSel ? "Gasto de kilometraje agregado." : "Gasto agregado.");
    setSMonto(""); setSFecha(""); setSComer(""); setSCc(""); setCatId(""); setSKm(""); setSLitros(""); setSTipoGas(""); setModo("");
  }
  async function guardarAprobador() {
    setMsg(null);
    try {
      const r = await api.actualizarLiquidacion(id, { aprobadorId: aprId });
      const extra = r.aprobadorNotificado ? ` Se re-envio la aprobacion (Teams) a ${r.aprobadorNotificado}.` : "";
      setMsg({ t: "ok", x: "Aprobador actualizado." + extra });
      await cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
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
          {puedeEditarApr ? (
            <div className="field"><label>Aprobador</label>
              <div className="row-inline">
                <UsuarioPicker usuarios={cat.usuarios} value={aprId} onChange={setAprId} />
                <AsyncButton className="ghost" onClick={guardarAprobador} disabled={!aprId || aprId === String(liq.aprobadorId ?? "")} loadingText="Guardando...">Guardar</AsyncButton>
              </div>
            </div>
          ) : <Field label="Aprobador" v={apr} />}
          <Field label="Reporte FO (Dynamics)" v={liq.numeroReporteFO ?? "-"} />
          <Field label="Ultima actualizacion" v={fdate(liq.updatedAt)} />
        </div>
      </div>

      <div className="section">
        <div className="listbar" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><span className="ico">$</span> Detalle de gastos</h3>
          <div className="toolbar">
            {editable && !esKilometraje(liq.proposito) && !esAnticipos(liq.proposito) && <button className="ghost" onClick={() => setModo(modo === "factura" ? "" : "factura")}>+ Desde factura</button>}
            {editable && <button className="ghost" onClick={() => setModo(modo === "simple" ? "" : "simple")}>+ {esKilometraje(liq.proposito) ? "Kilometraje" : esAnticipos(liq.proposito) ? "Anticipo" : "Regimen simplificado"}</button>}
            <button className="ghost" onClick={cargar}>Actualizar</button>
          </div>
        </div>

        {modo === "factura" && editable && (
          <div className="section" style={{ background: "#f7f9fb" }}>
            <div className="fields">
              <div className="field"><label>Factura no cruzada</label>
                <select value={facturaId} onChange={(e) => setFacturaId(e.target.value)}>
                  <option value="">-- elegir factura --</option>
                  {facturas.map((f) => <option key={f.id} value={f.id}>{(f.consecutivo ? f.consecutivo + " - " : "")}{f.emisorNombre} - {fmt(f.totalComprobante)} ({f.situacionFiscal})</option>)}
                </select></div>
              <div className="field"><label>Categoria</label>
                <Combo options={cats.map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
                  value={catId} onChange={setCatId} placeholder="-- elegir categoria --" /></div>
            </div>
            <div className="actions">
              <AsyncButton className="primary" onClick={agregarFactura} loadingText="Agregando...">Agregar gasto</AsyncButton>
              <button className="ghost" onClick={() => setModo("")}>Cancelar</button>
            </div>
            {facturas.length === 0 && <p><small className="mono">No hay facturas sin cruzar disponibles.</small></p>}
          </div>
        )}

        {modo === "simple" && editable && (
          <div className="section" style={{ background: "#f7f9fb" }}>
            <p><small className="mono">{esKilometraje(liq.proposito) ? "Kilometraje: el monto se calcula km x tarifa de la zona (si esta configurada en Tarifas KM); si no, usa el monto ingresado." : esAnticipos(liq.proposito) ? "Anticipo: un unico gasto, categoria de anticipos." : "Regimen simplificado: proveedor sin factura electronica. Se ingresan los datos a mano."}</small></p>
            <div className="fields">
              <div className="field"><label>Monto ({liq.moneda})</label><input type="number" value={sMonto} onChange={(e) => setSMonto(e.target.value)} /></div>
              <div className="field"><label>Fecha</label><input type="date" value={sFecha} onChange={(e) => setSFecha(e.target.value)} /></div>
              <div className="field"><label>Comerciante</label><input value={sComer} onChange={(e) => setSComer(e.target.value)} placeholder="Nombre del proveedor" /></div>
              <div className="field"><label>Categoria</label>
                <Combo options={cats.map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
                  value={catId} onChange={setCatId} placeholder="-- elegir categoria --" /></div>
              <div className="field"><label>Situacion fiscal</label>
                <select value={sSit} onChange={(e) => setSSit(e.target.value)}>
                  <option value="IVA">IVA</option><option value="EXENTO">EXENTO</option><option value="NO SUJETO">NO SUJETO</option>
                </select></div>
              <div className="field"><label>Centro de costo</label>
                <select value={sCc} onChange={(e) => setSCc(e.target.value)}>
                  <option value="">(del informe)</option>
                  {cat.centrosCosto.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              {esKilometraje(liq.proposito) && (<>
                <div className="field"><label>Zona</label>
                  <select value={sZona} onChange={(e) => setSZona(e.target.value)}>
                    <option value="GAM">GAM</option><option value="GIRAS">GIRAS</option>
                  </select></div>
                <div className="field"><label>Kilometros</label><input type="number" value={sKm} onChange={(e) => setSKm(e.target.value)} /></div>
              </>)}
              {esCombSel && (<>
                <div className="field"><label>Litros *</label><input type="number" step="0.01" min="0" value={sLitros} onChange={(e) => setSLitros(e.target.value)} placeholder="0.00" /></div>
                <div className="field"><label>Tipo de combustible *</label>
                  <select value={sTipoGas} onChange={(e) => setSTipoGas(e.target.value)}>
                    <option value="">-- elegir --</option>
                    <option value="GASOLINA">Gasolina</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="GAS_LP">Gas LP</option>
                  </select></div>
              </>)}
            </div>
            <div className="actions">
              <AsyncButton className="primary" onClick={agregarSimple} loadingText="Agregando...">Agregar gasto simplificado</AsyncButton>
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
          <AsyncButton className="primary" disabled={!editable} onClick={enviarInforme} loadingText="Enviando...">Enviar</AsyncButton>
          <AsyncButton className="primary" disabled={liq.estado !== "ENVIADA"} onClick={() => accion(() => api.aprobar(id), "Aprobado por el aprobador.")} loadingText="Aprobando...">1. Aprobar (aprobador)</AsyncButton>
          <AsyncButton className="primary" disabled={!["EN_REVISION_CONTA", "ERROR_POSTEO", "APROBADA"].includes(liq.estado)} onClick={() => accion(() => api.aprobarConta(id), "Posteado a FO.")} loadingText="Posteando...">{liq.estado === "ERROR_POSTEO" || liq.estado === "APROBADA" ? "2. Reintentar posteo FO" : "2. Aprobar conta -> postear"}</AsyncButton>
          <AsyncButton className="ghost" disabled={!(liq.estado === "ENVIADA" || liq.estado === "EN_REVISION_CONTA")} onClick={() => comentario && accion(() => api.devolver(id, comentario), "Devuelto.")} loadingText="Devolviendo...">Devolver</AsyncButton>
        </div>
      </div>
    </>
  );
}

function GastoForm({ liqId, gastoId, cat, onBack }: { liqId: string; gastoId: string; cat: Catalogos; onBack: () => void; }) {
  const [g, setG] = useState<Gasto | null>(null);
  const [estadoLiq, setEstadoLiq] = useState("");
  const [grupo, setGrupo] = useState(""); const [ccId, setCcId] = useState(""); const [info, setInfo] = useState(""); const [catId, setCatId] = useState(""); const [numFactura, setNumFactura] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [dMonto, setDMonto] = useState(""); const [dCc, setDCc] = useState(""); const [dCat, setDCat] = useState("");
  const [dividir, setDividir] = useState(false);
  const [editFac, setEditFac] = useState(false);
  const [fTotal, setFTotal] = useState(""); const [fSit, setFSit] = useState("");
  const [litros, setLitros] = useState(""); const [tipoGas, setTipoGas] = useState("");
  const [zonaG, setZonaG] = useState(""); const [kmG, setKmG] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const cargar = () => api.detalle(liqId).then((l) => {
    setEstadoLiq(l.estado);
    const found = (l.gastos ?? []).find((x) => x.id === gastoId) ?? null;
    setG(found);
    if (found) { setGrupo(found.grupoImpuesto); setCcId(found.centroCostoId ?? ""); setInfo(found.informacionAdicional ?? ""); setLitros(found.litros != null ? String(found.litros) : ""); setTipoGas(found.tipoGasolina ?? ""); setCatId((found as { categoriaId?: string }).categoriaId ?? found.categoria?.id ?? ""); setNumFactura(found.numeroFactura ?? ""); setZonaG(found.zona ?? ""); setKmG(found.kilometros != null ? String(found.kilometros) : ""); }
  }).catch(() => {});
  useEffect(() => { cargar(); }, [liqId, gastoId]);
  if (!g) return <div className="section">Cargando...</div>;
  const editable = estadoLiq === "BORRADOR" || estadoLiq === "DEVUELTA";
  const esCombustible = g.categoria?.codigo === "COMBUSTIBLES";

  async function guardar() {
    setMsg(null);
    try {
      const r = await api.actualizarGasto(gastoId, { grupoImpuesto: grupo, centroCostoId: ccId || null, informacionAdicional: info, litros: litros === "" ? null : Number(litros), tipoGasolina: tipoGas || null, categoriaId: catId || undefined, numeroFactura: numFactura, zona: zonaG || null, kilometros: kmG === "" ? null : Number(kmG) });
      setMsg(r.errores.length ? { t: "err", x: r.errores.join(" | ") } : { t: "ok", x: "Gasto guardado." });
      await cargar();
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
  function fdesglose(total: number, sit: string) {
    if (sit === "IVA") { const imp = Math.round((total * 0.13) / 1.13); return { totalImpuesto: imp, totalGravado: total - imp, totalExento: 0, totalNoSujeto: 0 }; }
    if (sit === "EXENTO") return { totalImpuesto: 0, totalGravado: 0, totalExento: total, totalNoSujeto: 0 };
    return { totalImpuesto: 0, totalGravado: 0, totalExento: 0, totalNoSujeto: total };
  }
  async function guardarFactura() {
    if (!g?.facturaId) return;
    setMsg(null);
    const total = Number(fTotal);
    if (!(total > 0)) return setMsg({ t: "err", x: "El total debe ser mayor que 0." });
    try {
      await api.actualizarFactura(g.facturaId, { totalComprobante: total, situacionFiscal: fSit, ...fdesglose(total, fSit) });
      setMsg({ t: "ok", x: "Factura actualizada. El gasto se ajusto al nuevo monto." });
      setEditFac(false);
      await cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
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
          <div className="field"><label>Numero de factura</label>
            <input value={numFactura} onChange={(e) => setNumFactura(e.target.value)} placeholder="Consecutivo / nro. de comprobante" /></div>
          <div className="field"><label>Categoria</label>
            <Combo options={cat.categorias.filter((c) => c.empresa === (g.categoria?.empresa ?? "ntc")).map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
              value={catId} onChange={setCatId} placeholder="Escribi la categoria..." /></div>
          <Field label="Fecha gasto" v={fdate(g.fecha)} />
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
      {g.factura && (
        <div className="section">
          <div className="listbar" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}><span className="ico">F</span> Factura asociada</h3>
            <div className="toolbar"><button className="ghost" onClick={() => { setFTotal(String(g.factura!.totalComprobante)); setFSit(g.factura!.situacionFiscal === "NO_SUJETO" ? "NO SUJETO" : g.factura!.situacionFiscal); setEditFac(!editFac); }}>{editFac ? "Cancelar" : "Editar montos"}</button></div>
          </div>
          <div className="fields">
            <Field label="Numero (consecutivo)" v={g.factura.consecutivo ?? "-"} />
            <Field label="Emisor" v={g.factura.emisorNombre ?? "-"} />
            <Field label="Clave" v={g.factura.clave} />
            <Field label="Estado factura" v={g.factura.estado} />
            <Field label="Total comprobante" v={`${fmt(g.factura.totalComprobante)} ${g.factura.moneda}`} />
            <Field label="Situacion fiscal" v={g.factura.situacionFiscal} />
          </div>
          {editFac && (
            <>
              <p><small className="mono">Al cambiar el total o la situacion, el gasto se ajusta automaticamente (las divisiones conservan su monto).</small></p>
              <div className="fields">
                <div className="field"><label>Total comprobante</label><input type="number" value={fTotal} onChange={(e) => setFTotal(e.target.value)} /></div>
                <div className="field"><label>Situacion fiscal</label>
                  <select value={fSit} onChange={(e) => setFSit(e.target.value)}>
                    <option value="IVA">IVA</option><option value="EXENTO">EXENTO</option><option value="NO SUJETO">NO SUJETO</option>
                  </select></div>
              </div>
              <div className="actions"><AsyncButton className="primary" onClick={guardarFactura} loadingText="Guardando...">Guardar factura</AsyncButton></div>
            </>
          )}
        </div>
      )}
      {(esCombustible || g.litros != null || g.tipoGasolina) && (
        <div className="section">
          <h3><span className="ico">L</span> Informacion del combustible</h3>
          <div className="fields">
            <div className="field"><label>Litros</label>
              <input type="number" step="0.01" min="0" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="0.00" /></div>
            <div className="field"><label>Tipo de gasolina</label>
              <select value={tipoGas} onChange={(e) => setTipoGas(e.target.value)}>
                <option value="">-- sin definir --</option>
                <option value="GASOLINA">Gasolina</option>
                <option value="DIESEL">Diesel</option>
                <option value="GAS_LP">Gas LP</option>
              </select></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={guardar} loadingText="Guardando...">Guardar combustible</AsyncButton></div>
        </div>
      )}
      {(g.tipoComprobante === "KILOMETRAJE" || g.zona != null || g.kilometros != null) && (
        <div className="section">
          <h3><span className="ico">K</span> Informacion de kilometraje</h3>
          <div className="fields">
            <div className="field"><label>Zona</label>
              <select value={zonaG} onChange={(e) => setZonaG(e.target.value)}>
                <option value="">-- sin definir --</option>
                <option value="GAM">GAM</option>
                <option value="GIRAS">GIRAS</option>
              </select></div>
            <div className="field"><label>Kilometros</label>
              <input type="number" step="0.01" min="0" value={kmG} onChange={(e) => setKmG(e.target.value)} placeholder="0.00" /></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={guardar} loadingText="Guardando...">Guardar kilometraje</AsyncButton></div>
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
        <div className="actions"><AsyncButton className="primary" onClick={guardar} loadingText="Guardando...">Guardar gasto</AsyncButton></div>
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
              <div className="actions"><AsyncButton className="primary" onClick={hacerDivision} loadingText="Dividiendo...">Crear division</AsyncButton></div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function FacturasView({ prefillClave, onConsumePrefill }: { prefillClave?: string | null; onConsumePrefill?: () => void }) {
  const [rows, setRows] = useState<Factura[]>([]);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [crear, setCrear] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [f, setF] = useState({ clave: "", consecutivo: "", emisorNombre: "", total: "", situacionFiscal: "EXENTO", moneda: "CRC", fecha: "", detalle: "" });
  const [ef, setEf] = useState({ total: "", situacionFiscal: "EXENTO" });

  const cargar = () => api.facturas().then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    if (prefillClave) {
      setCrear(true);
      setF((prev) => ({ ...prev, clave: prefillClave }));
      onConsumePrefill?.();
    }
  }, [prefillClave]);

  function desglose(total: number, sit: string) {
    if (sit === "IVA") { const imp = Math.round((total * 0.13) / 1.13); return { totalImpuesto: imp, totalGravado: total - imp, totalExento: 0, totalNoSujeto: 0 }; }
    if (sit === "EXENTO") return { totalImpuesto: 0, totalGravado: 0, totalExento: total, totalNoSujeto: 0 };
    return { totalImpuesto: 0, totalGravado: 0, totalExento: 0, totalNoSujeto: total };
  }

  async function crearFac() {
    setMsg(null);
    const total = Number(f.total);
    if (!f.clave.trim() || !(total > 0)) return setMsg({ t: "err", x: "Clave y total (>0) son obligatorios." });
    try {
      await api.crearFactura({ clave: f.clave.replace(/\s+/g, ""), consecutivo: f.consecutivo, emisorNombre: f.emisorNombre, moneda: f.moneda, situacionFiscal: f.situacionFiscal, totalComprobante: total, ...desglose(total, f.situacionFiscal), fechaEmision: f.fecha || undefined, detalle: f.detalle });
      setMsg({ t: "ok", x: "Factura creada." }); setCrear(false);
      setF({ clave: "", consecutivo: "", emisorNombre: "", total: "", situacionFiscal: "EXENTO", moneda: "CRC", fecha: "", detalle: "" });
      cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  function abrirEditar(fac: Factura) { setEditId(fac.id); setEf({ total: String(fac.totalComprobante), situacionFiscal: fac.situacionFiscal === "NO_SUJETO" ? "NO SUJETO" : fac.situacionFiscal }); }
  async function guardarEditar() {
    if (!editId) return; setMsg(null);
    const total = Number(ef.total);
    if (!(total > 0)) return setMsg({ t: "err", x: "El total debe ser mayor que 0." });
    try {
      await api.actualizarFactura(editId, { totalComprobante: total, situacionFiscal: ef.situacionFiscal, ...desglose(total, ef.situacionFiscal) });
      setMsg({ t: "ok", x: "Factura actualizada." }); setEditId(null); cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  const filtradas = rows.filter((r) => !filtro || (r.consecutivo ?? "").includes(filtro) || (r.emisorNombre ?? "").toLowerCase().includes(filtro.toLowerCase()) || r.clave.includes(filtro));

  return (
    <>
      <div className="listbar"><h2>Facturas</h2><span className="caret">v</span>
        <div className="toolbar">
          <button className="primary" onClick={() => setCrear(!crear)}>+ Factura manual</button>
          <input placeholder="Filtrar por # / emisor / clave" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 260 }} />
        </div>
      </div>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      {crear && (
        <div className="section"><h3><span className="ico">+</span> Nueva factura manual</h3>
          <p><small className="mono">Cuando la factura no llego por correo y hay que ingresarla a mano.</small></p>
          <div className="fields">
            <div className="field"><label>Clave (50 digitos)</label><input value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></div>
            <div className="field"><label>Consecutivo (# factura)</label><input value={f.consecutivo} onChange={(e) => setF({ ...f, consecutivo: e.target.value })} /></div>
            <div className="field"><label>Emisor</label><input value={f.emisorNombre} onChange={(e) => setF({ ...f, emisorNombre: e.target.value })} /></div>
            <div className="field"><label>Total</label><input type="number" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></div>
            <div className="field"><label>Situacion fiscal</label><select value={f.situacionFiscal} onChange={(e) => setF({ ...f, situacionFiscal: e.target.value })}><option value="EXENTO">EXENTO</option><option value="IVA">IVA</option><option value="NO SUJETO">NO SUJETO</option></select></div>
            <div className="field"><label>Moneda</label><select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
            <div className="field"><label>Fecha</label><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
            <div className="field"><label>Detalle</label><input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={crearFac} loadingText="Creando...">Crear factura</AsyncButton><button className="ghost" onClick={() => setCrear(false)}>Cancelar</button></div>
        </div>
      )}
      <div className="grid"><table>
        <thead><tr><th># Factura</th><th>Emisor</th><th className="num">Total</th><th>Moneda</th><th>Situacion</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {filtradas.map((r) => (
            <tr key={r.id}>
              <td className="pill-link">{r.consecutivo || "-"}</td><td>{r.emisorNombre}</td>
              <td className="num">{fmt(r.totalComprobante)}</td><td>{r.moneda}</td><td>{r.situacionFiscal}</td>
              <td><span className={`badge estado-${r.estado === "CRUZADA" ? "POSTEADA" : "BORRADOR"}`}>{r.estado}</span></td>
              <td>{r.estado !== "CRUZADA" && <button className="ghost" onClick={() => abrirEditar(r)}>Editar montos</button>}</td>
            </tr>
          ))}
          {filtradas.length === 0 && <tr><td colSpan={7}>Sin facturas.</td></tr>}
        </tbody>
      </table></div>
      {editId && (
        <div className="section"><h3><span className="ico">$</span> Editar montos de la factura</h3>
          <p><small className="mono">Solo facturas no cruzadas. El desglose (gravado/exento/no sujeto) se calcula segun la situacion.</small></p>
          <div className="fields">
            <div className="field"><label>Total</label><input type="number" value={ef.total} onChange={(e) => setEf({ ...ef, total: e.target.value })} /></div>
            <div className="field"><label>Situacion fiscal</label><select value={ef.situacionFiscal} onChange={(e) => setEf({ ...ef, situacionFiscal: e.target.value })}><option value="EXENTO">EXENTO</option><option value="IVA">IVA</option><option value="NO SUJETO">NO SUJETO</option></select></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={guardarEditar} loadingText="Guardando...">Guardar</AsyncButton><button className="ghost" onClick={() => setEditId(null)}>Cancelar</button></div>
        </div>
      )}
    </>
  );
}

function claveDeCaptura(c: Record<string, unknown>): string {
  const directa = String(c["clave"] ?? "").trim();
  if (directa) return directa;
  const ocr = String(c["contenidoOcr"] ?? "").replace(/\s+/g, "");
  const m = ocr.match(/\d{50}/); // clave de Hacienda = 50 digitos
  return m ? m[0] : "";
}

function CapturasView({ cat, onCrearFactura }: { cat: Catalogos; onCrearFactura: (clave: string) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [liqs, setLiqs] = useState<Liquidacion[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [cv, setCv] = useState({ monto: "", fecha: "", comerciante: "", categoriaId: "", situacionFiscal: "EXENTO", liquidacionId: "", centroCostoId: "", numeroFactura: "" });
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  const cargar = () => api.capturas().then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); api.listar().then(setLiqs).catch(() => {}); }, []);

  function abrirConvertir(c: Record<string, unknown>) {
    setConvId(String(c["id"]));
    setCv({ monto: "", fecha: "", comerciante: "", categoriaId: String(c["categoriaId"] ?? ""), situacionFiscal: "EXENTO", liquidacionId: String(c["liquidacionId"] ?? ""), centroCostoId: "", numeroFactura: "" });
    setMsg(null);
  }
  async function convertir() {
    if (!convId) return;
    if (!cv.monto || !cv.fecha || !cv.comerciante || !cv.categoriaId || !cv.liquidacionId) return setMsg({ t: "err", x: "Completa monto, fecha, comerciante, categoria y liquidacion." });
    try {
      await api.convertirRegimen(convId, { monto: Number(cv.monto), fecha: cv.fecha, comerciante: cv.comerciante, categoriaId: cv.categoriaId, situacionFiscal: cv.situacionFiscal, liquidacionId: cv.liquidacionId, centroCostoId: cv.centroCostoId || null, numeroFactura: cv.numeroFactura });
      setMsg({ t: "ok", x: "Gasto de regimen creado con la foto adjunta." }); setConvId(null); cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  async function marcar(id: string) {
    try { await api.marcarRegimen(id); setMsg({ t: "ok", x: "Captura marcada como regimen." }); cargar(); }
    catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  const empresaSel = liqs.find((l) => l.id === cv.liquidacionId)?.empresa;
  const catsConv = cat.categorias.filter((c) => !empresaSel || c.empresa === empresaSel);

  return (
    <>
      <div className="listbar"><h2>Capturas activas</h2><span className="caret">v</span></div>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      <div className="grid">
        <table>
          <thead><tr><th>Name</th><th>Correo empleado</th><th>Estado</th><th>Clave</th><th></th></tr></thead>
          <tbody>
            {rows.map((c, i) => {
              const id = String(c["id"] ?? i);
              const estado = String(c["estado"] ?? "");
              const clave = claveDeCaptura(c);
              const cruzada = estado === "CRUZADA";
              const regimen = estado === "PENDIENTE_REGIMEN";
              return (
                <tr key={id}>
                  <td>{String(c["name"] ?? "")}</td>
                  <td>{String(c["correoEmpleado"] ?? "")}</td>
                  <td><span className={`badge ${regimen ? "estado-EN_REVISION_CONTA" : "estado-" + (cruzada ? "POSTEADA" : "ENVIADA")}`}>{regimen ? "REGIMEN" : estado}</span></td>
                  <td><small className="mono">{clave}</small></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {regimen && <button className="ghost" onClick={() => abrirConvertir(c)}>Convertir a gasto</button>}
                      {!cruzada && !regimen && clave && <button className="ghost" onClick={() => onCrearFactura(clave)}>Crear factura</button>}
                      {!cruzada && !regimen && <button className="ghost" onClick={() => marcar(id)}>Marcar regimen</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5}>Sin capturas.</td></tr>}
          </tbody>
        </table>
      </div>
      {convId && (
        <div className="section">
          <h3><span className="ico">+</span> Convertir a gasto de regimen simplificado</h3>
          <p><small className="mono">La foto de la captura queda adjunta al gasto. El monto se ingresa a mano.</small></p>
          <div className="fields">
            <div className="field"><label>Liquidacion</label>
              <select value={cv.liquidacionId} onChange={(e) => setCv({ ...cv, liquidacionId: e.target.value, categoriaId: "" })}>
                <option value="">-- elegir --</option>{liqs.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.empresa.toUpperCase()} - {l.moneda})</option>)}
              </select></div>
            <div className="field"><label>Categoria</label>
              <Combo options={catsConv.map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo }))}
                value={cv.categoriaId} onChange={(v) => setCv({ ...cv, categoriaId: v })} placeholder="-- elegir categoria --" /></div>
            <div className="field"><label>Monto</label><input type="number" value={cv.monto} onChange={(e) => setCv({ ...cv, monto: e.target.value })} /></div>
            <div className="field"><label>Fecha</label><input type="date" value={cv.fecha} onChange={(e) => setCv({ ...cv, fecha: e.target.value })} /></div>
            <div className="field"><label>Comerciante</label><input value={cv.comerciante} onChange={(e) => setCv({ ...cv, comerciante: e.target.value })} placeholder="Nombre del proveedor" /></div>
            <div className="field"><label>Numero de factura</label><input value={cv.numeroFactura} onChange={(e) => setCv({ ...cv, numeroFactura: e.target.value })} placeholder="Nro. de comprobante" /></div>
            <div className="field"><label>Situacion fiscal</label>
              <select value={cv.situacionFiscal} onChange={(e) => setCv({ ...cv, situacionFiscal: e.target.value })}>
                <option value="EXENTO">EXENTO</option><option value="IVA">IVA</option><option value="NO SUJETO">NO SUJETO</option>
              </select></div>
            <div className="field"><label>Centro de costo (opcional)</label>
              <select value={cv.centroCostoId} onChange={(e) => setCv({ ...cv, centroCostoId: e.target.value })}>
                <option value="">(del informe)</option>{cat.centrosCosto.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={convertir} loadingText="Convirtiendo...">Convertir a gasto</AsyncButton><button className="ghost" onClick={() => setConvId(null)}>Cancelar</button></div>
        </div>
      )}
    </>
  );
}

function ReglasView({ cat }: { cat: Catalogos }) {
  const [rows, setRows] = useState<ReglaMonto[]>([]);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [crear, setCrear] = useState(false);
  const [nf, setNf] = useState({ categoriaCodigo: "", montoMaxCRC: "", montoMaxUSD: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState({ montoMaxCRC: "", montoMaxUSD: "", activo: true });
  const cargar = () => api.reglasMonto().then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); }, []);
  const codigos = Array.from(new Set(cat.categorias.map((c) => c.codigo))).sort();

  async function crearR() {
    if (!nf.categoriaCodigo) return setMsg({ t: "err", x: "Elegi la categoria." });
    try {
      await api.crearReglaMonto({ categoriaCodigo: nf.categoriaCodigo, montoMaxCRC: Number(nf.montoMaxCRC || 0), montoMaxUSD: Number(nf.montoMaxUSD || 0), activo: true });
      setMsg({ t: "ok", x: "Regla guardada." }); setCrear(false); setNf({ categoriaCodigo: "", montoMaxCRC: "", montoMaxUSD: "" }); cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  function abrirEditar(r: ReglaMonto) { setEditId(r.id); setEf({ montoMaxCRC: String(r.montoMaxCRC), montoMaxUSD: String(r.montoMaxUSD), activo: r.activo }); }
  async function guardarEditar() {
    if (!editId) return;
    try {
      await api.actualizarReglaMonto(editId, { montoMaxCRC: Number(ef.montoMaxCRC || 0), montoMaxUSD: Number(ef.montoMaxUSD || 0), activo: ef.activo });
      setMsg({ t: "ok", x: "Regla actualizada." }); setEditId(null); cargar();
    } catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }
  async function toggleActivo(r: ReglaMonto) {
    try { await api.actualizarReglaMonto(r.id, { activo: !r.activo }); cargar(); }
    catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  return (
    <>
      <div className="listbar"><h2>Reglas de monto</h2><span className="caret">v</span>
        <div className="toolbar"><button className="primary" onClick={() => setCrear(!crear)}>+ Nueva regla</button></div>
      </div>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      {crear && (
        <div className="section"><h3><span className="ico">+</span> Nueva regla de monto</h3>
          <div className="fields">
            <div className="field"><label>Categoria</label>
              <select value={nf.categoriaCodigo} onChange={(e) => setNf({ ...nf, categoriaCodigo: e.target.value })}>
                <option value="">-- elegir --</option>{codigos.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="field"><label>Monto max CRC</label><input type="number" value={nf.montoMaxCRC} onChange={(e) => setNf({ ...nf, montoMaxCRC: e.target.value })} /></div>
            <div className="field"><label>Monto max USD</label><input type="number" value={nf.montoMaxUSD} onChange={(e) => setNf({ ...nf, montoMaxUSD: e.target.value })} /></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={crearR} loadingText="Guardando...">Guardar regla</AsyncButton><button className="ghost" onClick={() => setCrear(false)}>Cancelar</button></div>
        </div>
      )}
      <div className="grid">
        <table>
          <thead><tr><th>Categoria</th><th className="num">Max CRC</th><th className="num">Max USD</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.categoriaCodigo}</td>
                <td className="num">{fmt(r.montoMaxCRC)}</td>
                <td className="num">{fmt(r.montoMaxUSD)}</td>
                <td><span className={`badge estado-${r.activo ? "APROBADA" : "DEVUELTA"}`}>{r.activo ? "Si" : "No"}</span></td>
                <td><div style={{ display: "flex", gap: 6 }}>
                  <button className="ghost" onClick={() => abrirEditar(r)}>Editar</button>
                  <button className="ghost" onClick={() => toggleActivo(r)}>{r.activo ? "Desactivar" : "Activar"}</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}>Sin reglas.</td></tr>}
          </tbody>
        </table>
      </div>
      {editId && (
        <div className="section"><h3><span className="ico">$</span> Editar regla</h3>
          <div className="fields">
            <div className="field"><label>Monto max CRC</label><input type="number" value={ef.montoMaxCRC} onChange={(e) => setEf({ ...ef, montoMaxCRC: e.target.value })} /></div>
            <div className="field"><label>Monto max USD</label><input type="number" value={ef.montoMaxUSD} onChange={(e) => setEf({ ...ef, montoMaxUSD: e.target.value })} /></div>
            <div className="field"><label>Activo</label>
              <select value={ef.activo ? "1" : "0"} onChange={(e) => setEf({ ...ef, activo: e.target.value === "1" })}><option value="1">Si</option><option value="0">No</option></select></div>
          </div>
          <div className="actions"><AsyncButton className="primary" onClick={guardarEditar} loadingText="Guardando...">Guardar</AsyncButton><button className="ghost" onClick={() => setEditId(null)}>Cancelar</button></div>
        </div>
      )}
    </>
  );
}

function TarifasKmView() {
  const [rows, setRows] = useState<TarifaKm[]>([]);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const cargar = () => api.tarifasKm().then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); }, []);

  function abrir(t: TarifaKm) { setEditId(t.id); setVal(String(t.montoPorKm)); }
  async function guardar() {
    if (!editId) return;
    try { await api.actualizarTarifaKm(editId, { montoPorKm: Number(val || 0) }); setMsg({ t: "ok", x: "Tarifa actualizada." }); setEditId(null); cargar(); }
    catch (e) { setMsg({ t: "err", x: describe(e) }); }
  }

  return (
    <>
      <div className="listbar"><h2>Tarifas por km (KILOMETRAJE)</h2><span className="caret">v</span></div>
      <p><small className="mono">El monto de un gasto de kilometraje se calcula como km x tarifa de la zona. Si la tarifa esta en 0, se usa el monto ingresado a mano.</small></p>
      {msg && <div className={`msg ${msg.t}`}>{msg.x}</div>}
      <div className="grid">
        <table>
          <thead><tr><th>Zona</th><th className="num">Monto por km</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.zona}</td>
                <td className="num">{editId === t.id ? <input type="number" step="0.01" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 120 }} /> : fmt(t.montoPorKm)}</td>
                <td><span className={`badge estado-${t.activo ? "APROBADA" : "DEVUELTA"}`}>{t.activo ? "Si" : "No"}</span></td>
                <td><div style={{ display: "flex", gap: 6 }}>
                  {editId === t.id
                    ? <><AsyncButton className="primary" onClick={guardar} loadingText="...">Guardar</AsyncButton><button className="ghost" onClick={() => setEditId(null)}>Cancelar</button></>
                    : <button className="ghost" onClick={() => abrir(t)}>Editar</button>}
                </div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4}>Sin tarifas.</td></tr>}
          </tbody>
        </table>
      </div>
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
function propo(p: string): string { return labelProposito(p); }
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
