// API HTTP (Fastify). Cablea puertos y servicios a rutas.
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Deps } from "../deps.js";
import { decodeBase64 } from "../services/ingestaFactura.js";
import { parseFactura, FacturaIgnorableError } from "../domain/parseFactura.js";
import { CEDULA_NUTRICARE, type SituacionFiscal } from "../domain/types.js";
import { procesarCruce } from "../services/procesarCruce.js";
import * as liq from "../services/liquidaciones.js";
import { crearFacturaManual, actualizarFactura, type FacturaManualInput } from "../services/facturas.js";
import { EntraTokenProvider } from "../adapters/azure/entraToken.js";
import { dividirGasto, crearGastoSimplificado, subirAdjunto } from "../services/gastos.js";

declare module "fastify" {
  interface FastifyRequest {
    sesion?: { id: string; email: string; nombre?: string; roles: string[]; rol: "admin" | "conta" | "estandar" };
  }
}

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

  // ---- Autenticacion: valida el token de Entra y pone req.sesion (usuario + rol) ----
  const authOn = !!deps.config?.auth.enabled;
  const adminRole = deps.config?.auth.adminRole ?? "Admin";
  const contaRole = deps.config?.auth.contaRole ?? "Contabilidad";
  const rolDe = (roles: string[]): "admin" | "conta" | "estandar" =>
    roles.includes(adminRole) ? "admin" : roles.includes(contaRole) ? "conta" : "estandar";
  const publica = (url: string) => url === "/health" || url.startsWith("/health?") || url.includes("/resultado-aprobacion");

  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "OPTIONS" || publica(req.url)) return;
    const hdr = req.headers["authorization"];
    const token = typeof hdr === "string" && hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
    const u = await deps.auth.usuarioActual(authOn ? token : (token || "dev"));
    if (!u) return reply.code(401).send({ ok: false, error: "No autenticado." });
    req.sesion = { ...u, rol: rolDe(u.roles) };
  });

  // Exige uno de los roles (admin siempre pasa). Responde 403 y devuelve false si no.
  const guard = (req: FastifyRequest, reply: FastifyReply, ...roles: Array<"conta" | "estandar">): boolean => {
    const rol = req.sesion?.rol ?? "estandar";
    if (rol === "admin" || roles.includes(rol as "conta" | "estandar")) return true;
    reply.code(403).send({ ok: false, error: "No autorizado para esta accion." });
    return false;
  };

  const enlaceLiq = (id: string): string | undefined => {
    const base = deps.config?.app.baseUrl ?? "";
    return base ? `${base.replace(/\/+$/, "")}/?liq=${id}` : undefined;
  };
  app.get("/health", async () => ({ ok: true, demo: deps.demo, auth: authOn, selfApproval: !!deps.config?.permitirAutoaprobacion, servicios: deps.modos ?? [] }));
  app.get("/me", async (req) => req.sesion ?? null);

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

    // Regimen simplificado: no hay clave que leer -> se salta el OCR y queda pendiente de convertir.
    if (b.esRegimen) {
      const cap = await deps.db.captura.create({
        data: { name: `CAP-${Date.now()}`, imagenUrl, contenidoOcr: "", confianza: 0, correoEmpleado: b.correoEmpleado, categoriaId: b.categoriaId ?? null, liquidacionId: b.liquidacionId ?? null, estado: "PENDIENTE_REGIMEN" },
      });
      return reply.code(201).send(cap);
    }

    let texto = "";
    let confianza = 0;
    let avisoOcr: string | undefined;
    try {
      const r = await deps.ocr.leerTexto(binario);
      texto = r.texto; confianza = r.confianza;
    } catch (e) {
      avisoOcr = `OCR no disponible: ${(e as Error).message}`;
      req.log.error({ err: e }, "OCR fallo");
    }
    const captura = await deps.db.captura.create({
      data: { name: `CAP-${Date.now()}`, imagenUrl, contenidoOcr: texto, confianza, correoEmpleado: b.correoEmpleado, categoriaId: b.categoriaId ?? null, liquidacionId: b.liquidacionId ?? null, estado: "PENDIENTE_CRUCE" },
    });
    return reply.code(201).send({ ...(captura as Record<string, unknown>), avisoOcr });
  });

  // Marcar una captura existente como regimen simplificado (para que no se cruce).
  app.post<{ Params: { id: string } }>("/capturas/:id/marcar-regimen", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const cap = (await deps.db.captura.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
    if (!cap) return reply.code(404).send({ error: "La captura no existe." });
    if (cap["estado"] === "CRUZADA") return reply.code(409).send({ error: "La captura ya fue cruzada." });
    await deps.db.captura.update({ where: { id: req.params.id }, data: { estado: "PENDIENTE_REGIMEN", facturaId: null } });
    return reply.send({ ok: true });
  });

  // Convertir una captura de regimen en un gasto simplificado (con la foto adjunta).
  app.post<{ Params: { id: string }; Body: { monto?: number; fecha?: string; comerciante?: string; categoriaId?: string; situacionFiscal?: SituacionFiscal; centroCostoId?: string | null; liquidacionId?: string; numeroFactura?: string } }>("/capturas/:id/convertir-regimen", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const cap = (await deps.db.captura.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
    if (!cap) return reply.code(404).send({ error: "La captura no existe." });
    if (cap["estado"] !== "PENDIENTE_REGIMEN") return reply.code(409).send({ error: "La captura no es de regimen o ya fue procesada." });
    const b = req.body ?? {};
    const liqId = b.liquidacionId ?? (cap["liquidacionId"] as string | null);
    if (!liqId) return reply.code(400).send({ error: "Falta la liquidacion (la captura no tiene una asociada)." });
    if (!b.monto || !b.fecha || !b.comerciante || !b.categoriaId || !b.situacionFiscal)
      return reply.code(400).send({ error: "Faltan campos (monto, fecha, comerciante, categoriaId, situacionFiscal)." });
    const imagenUrl = cap["imagenUrl"] as string | null;
    const r = await crearGastoSimplificado(deps.db, liqId, {
      monto: Number(b.monto), fecha: b.fecha, comerciante: b.comerciante, categoriaId: b.categoriaId,
      situacionFiscal: b.situacionFiscal, centroCostoId: b.centroCostoId ?? null, capturaId: req.params.id, numeroFactura: b.numeroFactura,
      adjunto: imagenUrl ? { nombre: "Comprobante (foto)", url: imagenUrl, tipo: "image" } : undefined,
    });
    if (!r.ok) return reply.code(422).send(r);
    await deps.db.captura.update({ where: { id: req.params.id }, data: { estado: "CRUZADA" } });
    return reply.code(201).send({ ok: true, gastoId: r.gastoId });
  });

  app.post<{ Body: CrearLiqBody }>("/liquidaciones", async (req, reply) => {
    const b = req.body ?? ({} as CrearLiqBody);
    const s = req.sesion;
    // Estandar crea siempre a su nombre; conta/admin pueden crear a nombre de otro empleado.
    const empleadoId = s && s.rol === "estandar" ? s.id : (b.empleadoId || s?.id || "");
    const correoEmpleado = s && s.rol === "estandar" ? s.email : (b.correoEmpleado ?? "");
    if (!empleadoId || !b?.empresa || !b?.proposito || !b?.moneda) return reply.code(400).send({ error: "Faltan campos (empresa, proposito, moneda)" });
    if (!deps.config?.permitirAutoaprobacion && b.aprobadorId && b.aprobadorId === empleadoId) return reply.code(400).send({ ok: false, error: "El aprobador no puede ser el mismo solicitante." });
    const creada = await liq.crearLiquidacion(deps.db, {
      empleadoId, correoEmpleado, empresa: b.empresa,
      proposito: b.proposito, moneda: b.moneda, centroCostoId: b.centroCostoId ?? null, aprobadorId: b.aprobadorId ?? null,
    });
    return reply.code(201).send(creada);
  });

  app.get<{ Querystring: { estado?: string } }>("/liquidaciones", async (req) => {
    const owner = req.sesion?.rol === "estandar" ? req.sesion.id : undefined;
    return liq.listarLiquidaciones(deps.db, req.query.estado, owner);
  });
  app.get<{ Params: { id: string } }>("/liquidaciones/:id", async (req, reply) => {
    const l = await liq.obtenerConGastos(deps.db, req.params.id);
    if (!l) return reply.code(404).send({ error: "No encontrada" });
    if (req.sesion?.rol === "estandar" && String((l as Record<string, unknown>)["empleadoId"] ?? "") !== req.sesion.id)
      return reply.code(403).send({ error: "No autorizado." });
    return l;
  });

  app.post<{ Params: { id: string } }>("/liquidaciones/:id/enviar", async (req, reply) => {
    const r = await liq.enviarInforme(deps.db, req.params.id);
    if (!r.ok) return reply.code(422).send(r);
    // Al enviar se crea el Teams Approval para el aprobador seleccionado.
    let aprobadorNotificado: string | undefined;
    let notifError: string | undefined;
    try {
      const l = (await deps.db.liquidacion.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
      const aprId = l?.["aprobadorId"] as string | undefined;
      if (!aprId) { notifError = "La liquidacion no tiene aprobador asignado."; }
      if (aprId) {
        const apr = (await deps.usuarios.listar()).find((u) => u.id === aprId);
        if (!apr) notifError = `No se encontro el aprobador (id ${aprId}) en el directorio.`;
        else if (!apr.email) notifError = "El aprobador no tiene correo.";
        if (apr?.email) {
          await deps.notificacion.solicitarAprobacion({ aprobadorEmail: apr.email, aprobadorNombre: apr.nombre, titulo: `Aprobar liquidacion ${String(l?.["name"] ?? "")}`, liquidacionId: req.params.id, liquidacionName: String(l?.["name"] ?? ""), enlace: enlaceLiq(req.params.id) });
          aprobadorNotificado = apr.nombre ?? apr.email;
        }
      }
    } catch (e) { notifError = (e as Error).message; app.log.error(`Notificacion de aprobacion fallo: ${notifError}`); }
    return reply.send({ ...r, aprobadorNotificado, notifError });
  });
  app.patch<{ Params: { id: string }; Body: { aprobadorId?: string; centroCostoId?: string | null } }>("/liquidaciones/:id", async (req, reply) => {
    const b = req.body ?? {};
    // Centro de costo (se propaga a los gastos para la dimension financiera).
    if (b.centroCostoId !== undefined) {
      const rc = await liq.actualizarCentroCosto(deps.db, req.params.id, b.centroCostoId ?? null);
      if (!rc.ok) return reply.code(400).send(rc);
      if (b.aprobadorId === undefined) return reply.send(rc);
    }
    if (b.aprobadorId === undefined) return reply.send({ ok: true });
    const r = await liq.actualizarAprobador(deps.db, req.params.id, b.aprobadorId ?? null, !!deps.config?.permitirAutoaprobacion);
    if (!r.ok) return reply.code(400).send(r);
    // Si ya estaba ENVIADA, re-notificar (Teams Approval) al nuevo aprobador.
    let aprobadorNotificado: string | undefined;
    if (r.estado === "ENVIADA" && b.aprobadorId) {
      try {
        const l = (await deps.db.liquidacion.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
        const apr = (await deps.usuarios.listar()).find((u) => u.id === b.aprobadorId);
        if (apr?.email) {
          await deps.notificacion.solicitarAprobacion({ aprobadorEmail: apr.email, aprobadorNombre: apr.nombre, titulo: `Aprobar liquidacion ${String(l?.["name"] ?? "")}`, liquidacionId: req.params.id, liquidacionName: String(l?.["name"] ?? ""), enlace: enlaceLiq(req.params.id) });
          aprobadorNotificado = apr.nombre ?? apr.email;
        }
      } catch (e) { app.log.error(`Notificacion de aprobacion fallo: ${(e as Error).message}`); }
    }
    return reply.send({ ok: true, aprobadorNotificado });
  });
  // Callback desde el flujo de Power Automate cuando el aprobador responde en Teams.
  app.post<{ Params: { id: string }; Body: { outcome?: string; comentario?: string } }>("/liquidaciones/:id/resultado-aprobacion", async (req, reply) => {
    const secret = deps.config?.notificacion.callbackSecret;
    if (secret && req.headers["x-approval-secret"] !== secret) return reply.code(401).send({ ok: false, error: "No autorizado." });
    const outcome = String(req.body?.outcome ?? "").trim().toLowerCase();
    const comentario = (req.body?.comentario ?? "").trim();
    const aprobado = outcome.startsWith("appro") || outcome.startsWith("aprob");
    const rechazado = outcome.startsWith("rej") || outcome.startsWith("rechaz");
    if (aprobado) {
      const r = await liq.aprobarAprobador(deps.db, req.params.id, comentario || undefined);
      return r.ok ? reply.send({ ok: true, estado: "EN_REVISION_CONTA" }) : reply.code(409).send(r);
    }
    if (rechazado) {
      const r = await liq.devolver(deps.db, req.params.id, comentario || "Rechazado por el aprobador en Teams.");
      return r.ok ? reply.send({ ok: true, estado: "DEVUELTA" }) : reply.code(409).send(r);
    }
    return reply.code(400).send({ ok: false, error: `Outcome no reconocido: ${req.body?.outcome ?? ""}` });
  });
  app.post<{ Params: { id: string }; Body: { comentario?: string } }>("/liquidaciones/:id/aprobar", async (req, reply) => {
    const l = (await deps.db.liquidacion.findUnique({ where: { id: req.params.id } })) as Record<string, unknown> | null;
    if (!l) return reply.code(404).send({ ok: false, error: "No existe la liquidacion." });
    if (req.sesion?.rol !== "admin" && String(l["aprobadorId"] ?? "") !== req.sesion?.id)
      return reply.code(403).send({ ok: false, error: "Solo el aprobador asignado puede aprobar esta liquidacion." });
    const r = await liq.aprobarAprobador(deps.db, req.params.id, req.body?.comentario);
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.post<{ Params: { id: string }; Body: { comentario: string } }>("/liquidaciones/:id/devolver", async (req, reply) => {
    if (!req.body?.comentario) return reply.code(400).send({ error: "Falta comentario" });
    const r = await liq.devolver(deps.db, req.params.id, req.body.comentario);
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.post<{ Params: { id: string } }>("/liquidaciones/:id/aprobar-conta", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const r = await liq.aprobarConta(deps.db, req.params.id, deps.finance, deps.usuarios);
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
    // Kilometraje no manda monto ni comerciante (monto = km x tarifa); anticipos no manda comerciante.
    // Requerimos siempre fecha, categoria y situacion fiscal; el resto lo valida crearGastoSimplificado.
    if (!b.fecha || !b.categoriaId || !b.situacionFiscal)
      return reply.code(400).send({ error: "Faltan campos (fecha, categoria, situacion fiscal)" });
    const r = await crearGastoSimplificado(deps.db, req.params.id, {
      monto: Number(b.monto) || 0, fecha: b.fecha, comerciante: b.comerciante ?? "",
      categoriaId: b.categoriaId, situacionFiscal: b.situacionFiscal, centroCostoId: b.centroCostoId ?? null,
      numeroFactura: b.numeroFactura, zona: b.zona ?? null,
      kilometros: b.kilometros != null ? Number(b.kilometros) : null,
      tipoComprobante: b.tipoComprobante,
      litros: b.litros != null ? Number(b.litros) : null, tipoGasolina: b.tipoGasolina ?? null,
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
  app.post<{ Params: { id: string }; Body: { nombre?: string; contenidoBase64?: string; mimeType?: string } }>("/liquidaciones/:id/adjuntos", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.nombre || !b.contenidoBase64) return reply.code(400).send({ error: "Falta el archivo (nombre/contenido)." });
    const r = await liq.subirAdjuntoLiquidacion(deps.db, deps.storage, req.params.id, { nombre: b.nombre, contenidoBase64: b.contenidoBase64, mimeType: b.mimeType ?? "application/octet-stream" });
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.post<{ Params: { id: string }; Body: { nombre?: string; contenidoBase64?: string; mimeType?: string } }>("/gastos/:id/adjuntos", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.nombre || !b.contenidoBase64) return reply.code(400).send({ error: "Faltan nombre o contenidoBase64" });
    const r = await subirAdjunto(deps.db, deps.storage, req.params.id, { nombre: b.nombre, contenidoBase64: b.contenidoBase64, mimeType: b.mimeType ?? "application/octet-stream" });
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });

  app.get("/facturas", async (req, reply) => guard(req, reply, "conta") ? deps.db.factura.findMany() : undefined);
  app.get("/facturas/sin-cruzar", async (req, reply) => guard(req, reply, "conta") ? liq.facturasSinCruzar(deps.db) : undefined);
  app.post<{ Body: FacturaManualInput }>("/facturas", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const r = await crearFacturaManual(deps.db, req.body);
    return r.ok ? reply.code(201).send(r) : reply.code(422).send(r);
  });
  app.patch<{ Params: { id: string }; Body: Partial<FacturaManualInput> }>("/facturas/:id", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const r = await actualizarFactura(deps.db, req.params.id, req.body ?? {});
    return r.ok ? reply.send(r) : reply.code(422).send(r);
  });
  app.get("/capturas", async (req, reply) => guard(req, reply, "conta") ? deps.db.captura.findMany() : undefined);
  app.get("/gastos", async (req, reply) => guard(req, reply, "conta") ? deps.db.gasto.findMany({ include: { categoria: true } }) : undefined);
  app.get("/reglas-monto", async (req, reply) => guard(req, reply, "conta") ? deps.db.reglaMonto.findMany() : undefined);
  app.post<{ Body: { categoriaCodigo?: string; montoMaxCRC?: number; montoMaxUSD?: number; activo?: boolean } }>("/reglas-monto", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const b = req.body ?? {};
    if (!b.categoriaCodigo) return reply.code(400).send({ error: "Falta categoriaCodigo." });
    const data = { categoriaCodigo: b.categoriaCodigo, montoMaxCRC: Number(b.montoMaxCRC ?? 0), montoMaxUSD: Number(b.montoMaxUSD ?? 0), activo: b.activo ?? true };
    const existe = (await deps.db.reglaMonto.findFirst({ where: { categoriaCodigo: b.categoriaCodigo } })) as { id: string } | null;
    if (existe) { await deps.db.reglaMonto.update({ where: { id: existe.id }, data }); return reply.send({ ok: true, actualizada: true }); }
    await deps.db.reglaMonto.create({ data });
    return reply.code(201).send({ ok: true });
  });
  app.patch<{ Params: { id: string }; Body: { montoMaxCRC?: number; montoMaxUSD?: number; activo?: boolean } }>("/reglas-monto/:id", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.montoMaxCRC !== undefined) data["montoMaxCRC"] = Number(b.montoMaxCRC);
    if (b.montoMaxUSD !== undefined) data["montoMaxUSD"] = Number(b.montoMaxUSD);
    if (b.activo !== undefined) data["activo"] = b.activo;
    await deps.db.reglaMonto.update({ where: { id: req.params.id }, data });
    return reply.send({ ok: true });
  });

  // Tarifas por km (KILOMETRAJE): editables por conta.
  app.get("/tarifas-km", async (req, reply) => guard(req, reply, "conta") ? deps.db.tarifaKm.findMany() : undefined);
  app.patch<{ Params: { id: string }; Body: { montoPorKm?: number; activo?: boolean } }>("/tarifas-km/:id", async (req, reply) => {
    if (!guard(req, reply, "conta")) return;
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.montoPorKm !== undefined) data["montoPorKm"] = Number(b.montoPorKm);
    if (b.activo !== undefined) data["activo"] = b.activo;
    await deps.db.tarifaKm.update({ where: { id: req.params.id }, data });
    return reply.send({ ok: true });
  });
  app.get("/colas", async (req, reply) => guard(req, reply, "conta") ? liq.colas(deps.db) : undefined);

  // Reinicio de datos de prueba (para demos repetibles). Desactivar con ALLOW_RESET=0.
  app.post("/admin/reset", async (req, reply) => {
    if (!guard(req, reply)) return;
    if (process.env.ALLOW_RESET === "0") return reply.code(403).send({ error: "Reset deshabilitado (ALLOW_RESET=0)." });
    const r = await liq.reiniciarDatosPrueba(deps.db);
    return reply.send(r);
  });

  // Ayudante: resuelve el Site ID de SharePoint (host + path) usando el token de Entra.
  // Ej: /admin/sharepoint-site?host=nutricaresa.sharepoint.com&path=/sites/RepositorioDesarrollo
  app.get<{ Querystring: { host?: string; path?: string } }>("/admin/sharepoint-site", async (req, reply) => {
    if (!guard(req, reply)) return;
    const c = deps.config;
    if (!c?.entra.tenantId || !c.entra.clientId || !c.entra.clientSecret) return reply.code(400).send({ error: "Entra no esta configurado en el .env" });
    const host = req.query.host; const path = req.query.path;
    if (!host || !path) return reply.code(400).send({ error: "Pasa ?host=...&path=/sites/..." });
    const tokens = new EntraTokenProvider({ tenantId: c.entra.tenantId, clientId: c.entra.clientId, clientSecret: c.entra.clientSecret });
    const token = await tokens.getToken("https://graph.microsoft.com/.default");
    const sres = await fetch(`https://graph.microsoft.com/v1.0/sites/${host}:${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const site = (await sres.json()) as { id?: string; displayName?: string; name?: string; webUrl?: string; error?: unknown };
    if (!sres.ok || !site.id) return reply.code(sres.status).send(site);
    const dres = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drives`, { headers: { Authorization: `Bearer ${token}` } });
    const drivesJson = (await dres.json()) as { value?: Array<{ id: string; name: string }> };
    return reply.send({
      siteId: site.id, nombre: site.displayName ?? site.name, webUrl: site.webUrl,
      bibliotecas: (drivesJson.value ?? []).map((d) => ({ id: d.id, name: d.name })),
      envSugerido: { STORAGE_PROVIDER: "sharepoint", SHAREPOINT_SITE_ID: site.id, SHAREPOINT_CARPETA_BASE: "Comprobantes Gastos" },
    });
  });

  // ---- Frontend compilado (produccion): el mismo App Service sirve la web ----
  //  El build de Vite queda en <raiz>/frontend/dist. Si existe, se sirve como
  //  estatico con fallback SPA (rutas del cliente -> index.html).
  const webDir = join(process.cwd(), "frontend", "dist");
  if (existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      const aceptaHtml = (req.headers["accept"] ?? "").includes("text/html");
      if (req.method === "GET" && aceptaHtml) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "No encontrado" });
    });
    app.log.info(`Frontend servido desde ${webDir}`);
  }

  return app;
}

interface CrearCapturaBody { correoEmpleado: string; imagenBase64: string; mimeType?: string; categoriaId?: string; liquidacionId?: string; esRegimen?: boolean; }
interface CrearLiqBody { empleadoId: string; correoEmpleado?: string; empresa: string; proposito: string; moneda: string; centroCostoId?: string; aprobadorId?: string; }
interface GastoPatch { centroCostoId?: string | null; grupoImpuesto?: string; informacionAdicional?: string; litros?: number | null; tipoGasolina?: string | null; categoriaId?: string; numeroFactura?: string; zona?: string | null; kilometros?: number | null; }
interface GastoSimpBody { monto?: number; fecha?: string; comerciante?: string; categoriaId?: string; situacionFiscal?: SituacionFiscal; centroCostoId?: string | null; numeroFactura?: string; zona?: string; kilometros?: number; tipoComprobante?: string; litros?: number; tipoGasolina?: string; }
