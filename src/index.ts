import { buildDeps } from "./deps.js";
import { buildDemoDeps } from "./demo/index.js";
import { buildServer } from "./api/server.js";

// DEMO_MODE=1 -> todo en memoria, sin Azure ni Dynamics (para desarrollo/QA).
const demo = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
const deps = demo ? buildDemoDeps() : buildDeps();
const app = buildServer(deps);
const port = Number(process.env.PORT ?? 8080);

app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => {
    app.log.info(`Nutricare liquidacion API en ${addr} (demo=${demo})`);
    // Poll automatico del buzon: carga las facturas del correo sin apretar el boton.
    // Se activa con CORREO_POLL_MIN>0. Requiere "Always On" en el App Service.
    const pollMin = deps.config?.correoPollMin ?? 0;
    if (pollMin > 0) {
      const correr = () => deps.correo.poll()
        .then((r) => app.log.info(`[correo] poll automatico: ${r.procesados} procesados`))
        .catch((e) => app.log.error(`[correo] poll automatico fallo: ${(e as Error).message}`));
      app.log.info(`[correo] poll automatico cada ${pollMin} min`);
      setTimeout(correr, 15_000); // primer ciclo poco despues de arrancar
      setInterval(correr, pollMin * 60_000);
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
