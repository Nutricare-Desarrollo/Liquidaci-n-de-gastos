// =====================================================================
//  Configuracion editable en runtime (tabla Configuracion, clave/valor JSON).
//  Hoy: aprobadores globales y grupos de aprobacion. Se puede editar desde la
//  app (pantalla de Configuracion) sin tocar variables de entorno ni redeploy.
//  Si no hay valor en la BD, se usa el fallback (las variables de entorno).
// =====================================================================
import type { Db } from "../db/client.js";

type Rec = Record<string, unknown>;

export interface ConfigAprobadores {
  globales: string[];   // correos que aprueban informes de CUALQUIER empresa
  grupos: string[][];   // grupos que se notifican juntos (primero en responder)
}

const K_GLOBALES = "aprobadoresGlobales";
const K_GRUPOS = "aprobadorGrupos";

async function leerJson<T>(db: Db, clave: string): Promise<T | null> {
  try {
    const row = (await db.configuracion.findUnique({ where: { clave } })) as Rec | null;
    if (!row) return null;
    return JSON.parse(String(row["valor"])) as T;
  } catch {
    // Tabla inexistente (migracion sin aplicar) o JSON invalido -> usar fallback (env).
    return null;
  }
}

async function guardarJson(db: Db, clave: string, valor: unknown): Promise<void> {
  const s = JSON.stringify(valor);
  const existe = (await db.configuracion.findUnique({ where: { clave } })) as Rec | null;
  if (existe) await db.configuracion.update({ where: { clave }, data: { valor: s } });
  else await db.configuracion.create({ data: { clave, valor: s } });
}

export async function leerAprobadores(db: Db, fallback: ConfigAprobadores): Promise<ConfigAprobadores> {
  const globales = await leerJson<string[]>(db, K_GLOBALES);
  const grupos = await leerJson<string[][]>(db, K_GRUPOS);
  return {
    globales: (globales ?? fallback.globales).map((e) => e.toLowerCase()),
    grupos: (grupos ?? fallback.grupos).map((g) => g.map((e) => e.toLowerCase())),
  };
}

export async function guardarAprobadores(db: Db, cfg: ConfigAprobadores): Promise<void> {
  const globales = (cfg.globales ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const grupos = (cfg.grupos ?? []).map((g) => g.map((e) => e.trim().toLowerCase()).filter(Boolean)).filter((g) => g.length > 0);
  await guardarJson(db, K_GLOBALES, globales);
  await guardarJson(db, K_GRUPOS, grupos);
}
