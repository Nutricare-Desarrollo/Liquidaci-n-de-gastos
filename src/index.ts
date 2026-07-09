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
  .then((addr) => app.log.info(`Nutricare liquidacion API en ${addr} (demo=${demo})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
