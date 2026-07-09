import { readFileSync, readdirSync } from "node:fs";
const B = "http://127.0.0.1:8090";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (p, body) => fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(j);
const get = (p) => fetch(B + p).then(j);

const fxDir = "test/fixtures";
const files = readdirSync(fxDir).filter((f) => f.endsWith(".xml"));

console.log("health:", await get("/health"));

const cat = await get("/catalogos");
console.log("catalogos: categorias=%d centros=%d grupos=%d usuarios=%d",
  cat.categorias.length, cat.centrosCosto.length, cat.gruposImpuesto.length, cat.usuarios.length);
const catComb = cat.categorias.find((c) => c.codigo === "COMBUSTIBLES" && c.empresa === "ntc");
const cc = cat.centrosCosto[0];

const liq = await post("/liquidaciones", {
  empleadoId: "u-emp", correoEmpleado: "desarrollo@nutricare.co.cr",
  empresa: "ntc", proposito: "TARJETA_CORPORATIVA", moneda: "CRC",
  centroCostoId: cc.id, aprobadorId: "u-apr",
});
console.log("liquidacion creada:", liq.name, liq.id);

for (const f of files) {
  const xml = readFileSync(`${fxDir}/${f}`, "utf-8");
  const ing = await post("/facturas/ingesta-xml", { xml });
  const clave = (xml.match(/<Clave>(\d{50})/) || [])[1];
  // "foto": base64 de un texto de OCR que incluye la clave (con ruido/espacios).
  const ocrText = `FACTURA ELECTRONICA\nClave ${clave.replace(/(.{5})/g, "$1 ")}\nGracias`;
  const imagenBase64 = Buffer.from(ocrText, "utf-8").toString("base64");
  const capt = await post("/capturas", {
    correoEmpleado: "desarrollo@nutricare.co.cr", imagenBase64,
    categoriaId: catComb.id, liquidacionId: liq.id,
  });
  console.log(`  ingesta ${f}: ${ing.status} total=${ing.total ?? "-"} sit=${ing.situacion ?? "-"} | captura ${capt.name}`);
}

const cruce = await post("/jobs/cruce");
console.log("cruce:", cruce);

let det = await get(`/liquidaciones/${liq.id}`);
console.log("gastos creados:", det.gastos.length);
for (const g of det.gastos) {
  console.log(`   ${g.name || "GAS"}: monto=${g.montoTotal} moneda=${g.moneda} metodoPago=${g.metodoPago} sitFiscal=${g.situacionFiscal} litros=${g.litros} tipoGas=${g.tipoGasolina} grupo=${g.grupoImpuesto} comerciante=${g.comerciante}`);
}

console.log("enviar:", await post(`/liquidaciones/${liq.id}/enviar`));
console.log("aprobar (aprobador):", (await post(`/liquidaciones/${liq.id}/aprobar`, { comentario: "ok" })).estado);
console.log("aprobar-conta (postea FO fake):", await post(`/liquidaciones/${liq.id}/aprobar-conta`));

det = await get(`/liquidaciones/${liq.id}`);
console.log(`estado final: ${det.estado} | numeroReporteFO: ${det.numeroReporteFO} | monto: ${det.montoInforme}`);

// anti-duplicado: reintento no debe re-postear
console.log("re-postear (anti-dup):", await post(`/liquidaciones/${liq.id}/postear`));
console.log("colas:", await get("/colas").then((c) => ({ facturasSinCaptura: c.facturasSinCaptura.length, capturasSinFactura: c.capturasSinFactura.length })));
