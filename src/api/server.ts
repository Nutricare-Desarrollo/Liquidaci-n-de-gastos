// API HTTP (Fastify). Cablea puertos y servicios a rutas.
import Fastify, { type FastifyInstance } from "fastify";
import type { Deps } from "../deps.js";
import { decodeBase64 } from "../services/ingestaFactura.js";
import { parseFactura, FacturaIgnorableError } from "../domain/parseFactura.js";
import { CEDULA_NUTRICARE, type SituacionFiscal } from "../domain/types.js";
import { procesarCruce } from "../services/procesarCruce.js";
import * as liq from "../services/liquidaciones.js";
import { dividirGasto, crearGastoSimplificado, subirAdjunto } from "../services/gastos.js";

export function buildServer(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const s = typeof body === "string" ? body.trim() : "";
    if (s === "") return done(null, {});
    try { done(null, JSON.parse(s)); } catch (err) { done(err as Error, undefined); }
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type,authorization");
    if (req.method === "OPTIONS") reply.code(204).send();
  });

  app.get("/health", async () => ({ ok: true, demo: deps.demo }));

  app.get("/catalogos", async () => ({
    categorias: await deps.db.categoria.findMany({ where: { activo: true } }),
    centrosCosto: await deps.db.centroCosto.findMany(),
    gruposImpuesto: await deps.db.grupoImpuesto.findMany(),
    usuarios: await deps.usuarios.listar(),
  }));

  app.post("/jobs/ingesta-correo", async () => deps.correo.poll());
  app.post("/jobs/cruce", async () => procesarCruce(deps.db));

  app.post<{ Body: { xml?: string } }>("/facturas/ingesta-xml", async (req, reply) => {
    const xml = req.body?.xml;
    if (!xml) return reply.code(400).send({ error: "Falta xml" });
    try {
      const f = parseFactura(xml);
      if (await deps.facturaRepo.existePorClave(f.clave)) return reply.code(200).send({ status: "duplicada", clave: f.clave });
      await deps.facturaRepo.guardar({ ...f, urlPdf: null, esDeLaEmpresa: f.receptorIdentificacion === CEDULA_NUTRICARE });
      return reply.code(201).send({ status: "ingestada", clave: f.clave, total: f.totalComprobante, situacion: f.situacionFiscal });
    } catch (e) {
      if (e instanceof FacturaIgnorableError) return reply.code(200).send({ status: "ignorada" });
      throw e;
    }
  });

  app.post<{ Body: CrearCapturaBody }>("/capturas", async (req, reply) => {
    const b = req.body;
    if (!b?.imagenBase64 || !b?.correoEmpleado) return reply.code(400).send({ error: "Faltan imagenBase64 o correoEmpleado" });
    const binario = decodeBase64(b.imagenBase64);
    const imagenUrl = await deps.storage.guardar({ contenido: binario, ruta: `capturas/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, mimeType: b.mimeType ?? "image/jpeg" });
    const { texto, confianza } = await deps.ocr.leerTexto(binario);
    const captura = await deps.db.captura.create({
      data: { name: `CAP-${Date.now()}`, imagenUrl, contenidoOcr: texto, confianza, correoEmpleado: b.correoEmpleado, categoriaId: b.categoriaId ?? null, liquidacionId: b.liquidacionId ?? null, estado: "PENDIENTE_CRUCE" },
    });
    return reply.code(201).send(captura);
  });

  app.post<{ Body: CrearLiqBody }>("/liquidaciones", async (req, reply) => {
    const b = req.body;
    if (!b?.empleadoId || !b?.empresa || !b?.proposito || !b?.moneda) return reply.code(400).send({ error: "Faltan campos (empleadoId, empresa, proposito, moneda)" });
    const creada = await liq.crearLiquidacion(deps.db, {
      empleadoId: b.empleadoId, correoEmpleado: b.correoEmpleado ?? "", empresa: b.empresa,
      proposito: b.proposito, moneda: b.moneda, centroCostoId: b.centroCostoId ?? null, aprobadorId: b.aprobadorId ?? null,
    });
    return reply.code(201).send(creada);
  });

  app.get<{ Querystring: { estado?: string } }>("/liquidaciones", async (req) => liq.listarLiquidaciones(deps.db, req.query.estado));
  app.get<{ Params: { id: string } }>("/liquidaciones/:id", async (req, reply) => {
    const l = await liq.obtenerConGastos(deps.db, req.params.id);
    return l ? l : reply.code(404).send({ error: "No encontrada" });
  });

  app.post<{ Params: { id: string } }>("/liquidaciones/:id/enviar", async (req, reply) => {
    const r = await liq.enviarInforme(deps.db, req.params.id);
    if (!r.ok) return reply.code(422).send(r);
    // Al enviar se crea el Teams Approval para el aprobador seleccionado.
    let aprobadorNotificado: string | undefined;
    try {
      const l = (await deps.db.liquidacion.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
      const aprId = l?.["aprobadorId"] as string | undefined;
      if (aprId) {
        const apr = (await deps.usuarios.listar()).find((u) => u.id === aprId);
        if (apr?.email) {
          await deps.notificacion.solicitarAprobacion({ aprobadorEmail: apr.email, aprobadorNombre: apr.nombre, titulo: `Aprobar liquidacion ${String(l?.["name"] ?? "")}`, liquidacionId: req.params.id, liquidacionName: String(l?.["name"] ?? "") });
          aprobadorNotificado = apr.nombre ?? apr.email;
        }
      }
    } catch { /* no bloquear el envio si la notificacion falla */ }
    return reply.send({ ...r, aprobadorNotificado });
  });
  app.post<{ Params: { id: string }; Body: { comentario?: string } }>("/liquidaciones/:id/aprobar", async (req, reply) => {
    const r = await liq.aprobarAprobador(deps.db, req.params.id, req.body?.comentario);
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.post<{ Params: { id: string }; Body: { comentario: string } }>("/liquidaciones/:id/devolver", async (req, reply) => {
    if (!req.body?.comentario) return reply.code(400).send({ error: "Falta comentario" });
    const r = await liq.devolver(deps.db, req.params.id, req.body.comentario);
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.post<{ Params: { id: string } }>("/liquidaciones/:id/aprobar-conta", async (req, reply) => {
    const r = await liq.aprobarConta(deps.db, req.params.id, deps.finance);
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });

  // Crear gasto manual desde una factura no cruzada.
  app.post<{ Params: { id: string }; Body: { facturaId?: string; categoriaId?: string } }>("/liquidaciones/:id/gastos", async (req, reply) => {
    const { facturaId, categoriaId } = req.body ?? {};
    if (!facturaId || !categoriaId) return reply.code(400).send({ error: "Faltan facturaId o categoriaId" });
    const r = await liq.crearGastoManual(deps.db, req.params.id, facturaId, categoriaId);
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });

  // Crear gasto de Regimen Simplificado (sin factura electronica).
  app.post<{ Params: { id: string }; Body: GastoSimpBody }>("/liquidaciones/:id/gastos-simplificado", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.monto || !b.fecha || !b.comerciante || !b.categoriaId || !b.situacionFiscal)
      return reply.code(400).send({ error: "Faltan campos (monto, fecha, comerciante, categoriaId, situacionFiscal)" });
    const r = await crearGastoSimplificado(deps.db, req.params.id, {
      monto: Number(b.monto), fecha: b.fecha, comerciante: b.comerciante,
      categoriaId: b.categoriaId, situacionFiscal: b.situacionFiscal, centroCostoId: b.centroCostoId ?? null,
    });
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });

  // Dividir un gasto.
  app.post<{ Params: { id: string }; Body: { monto?: number; centroCostoId?: string | null; categoriaId?: string } }>("/gastos/:id/dividir", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.monto) return reply.code(400).send({ error: "Falta monto" });
    const r = await dividirGasto(deps.db, req.params.id, { monto: Number(b.monto), centroCostoId: b.centroCostoId ?? null, categoriaId: b.categoriaId });
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });

  app.patch<{ Params: { id: string }; Body: GastoPatch }>("/gastos/:id", async (req) => liq.actualizarGasto(deps.db, req.params.id, req.body ?? {}));

  // Adjuntar imagen/PDF a un gasto (para casos sin PDF de Hacienda, o el PDF del correo).
  app.post<{ Params: { id: string }; Body: { nombre?: string; contenidoBase64?: string; mimeType?: string } }>("/gastos/:id/adjuntos", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.nombre || !b.contenidoBase64) return reply.code(400).send({ error: "Faltan nombre o contenidoBase64" });
    const r = await subirAdjunto(deps.db, deps.storage, req.params.id, { nombre: b.nombre, contenidoBase64: b.contenidoBase64, mimeType: b.mimeType ?? "application/octet-stream" });
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });

  app.get("/facturas", async () => deps.db.factura.findMany());
  app.get("/facturas/sin-cruzar", async () => liq.facturasSinCruzar(deps.db));
  app.get("/capturas", async () => deps.db.captura.findMany());
  app.get("/gastos", async () => deps.db.gasto.findMany({ include: { categoria: true } }));
  app.get("/reglas-monto", async () => deps.db.reglaMonto.findMany());
  app.get("/colas", async () => liq.colas(deps.db));

  return app;
}

interface CrearCapturaBody { correoEmpleado: string; imagenBase64: string; mimeType?: string; categoriaId?: string; liquidacionId?: string; }
interface CrearLiqBody { empleadoId: string; correoEmpleado?: string; empresa: string; proposito: string; moneda: string; centroCostoId?: string; aprobadorId?: string; }
interface GastoPatch { centroCostoId?: string | null; grupoImpuesto?: string; informacionAdicional?: string; litros?: number; tipoGasolina?: number | null; }
interface GastoSimpBody { monto?: number; fecha?: string; comerciante?: string; categoriaId?: string; situacionFiscal?: SituacionFiscal; centroCostoId?: string | null; }
