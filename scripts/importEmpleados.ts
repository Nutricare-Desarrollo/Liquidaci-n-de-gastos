// =====================================================================
//  Importa el mapeo Empleado -> Numero de empleado (personnelNumber) para FO.
//  Fuente (una de las dos):
//    - fo/empleados.json  (respuesta OData de EmployeesV2, con .value[])
//    - fo/empleados.csv   (columnas: email,personnelNumber,nombre)
//  Correr:  npx tsx --env-file=.env scripts/importEmpleados.ts
//  Upsert por email. Deduplica por email y por numero (ambos unicos).
// =====================================================================
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";

interface Fila { email: string; personnelNumber: string; nombre?: string; }

function desdeJson(path: string): Fila[] {
  const d = JSON.parse(readFileSync(path, "utf8")) as { value?: Record<string, unknown>[] } | Record<string, unknown>[];
  const arr = Array.isArray(d) ? d : (d.value ?? []);
  return arr.map((r) => ({
    email: String(r["PrimaryContactEmail"] ?? r["email"] ?? "").toLowerCase().trim(),
    personnelNumber: String(r["PersonnelNumber"] ?? r["personnelNumber"] ?? "").trim(),
    nombre: (r["Name"] ?? r["nombre"]) ? String(r["Name"] ?? r["nombre"]) : undefined,
  }));
}

function desdeCsv(path: string): Fila[] {
  const lineas = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return [];
  const headers = lineas[0].split(",").map((h) => h.trim().toLowerCase());
  return lineas.slice(1).map((linea) => {
    const cols = linea.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return { email: (row["email"] ?? "").toLowerCase(), personnelNumber: (row["personnelnumber"] ?? row["numero"] ?? "").trim(), nombre: row["nombre"] || undefined };
  });
}

async function main() {
  const jsonPath = fileURLToPath(new URL("../fo/empleados.json", import.meta.url));
  const csvPath = fileURLToPath(new URL("../fo/empleados.csv", import.meta.url));
  const filas = existsSync(jsonPath) ? desdeJson(jsonPath) : desdeCsv(csvPath);
  console.log(`Fuente: ${existsSync(jsonPath) ? "empleados.json" : "empleados.csv"} (${filas.length} registros)`);

  const db = getDb();
  const vistoEmail = new Set<string>();
  const vistoNum = new Set<string>();
  let creados = 0, actualizados = 0, saltados = 0, errores = 0;

  for (const f of filas) {
    if (!f.email || !f.personnelNumber) { saltados++; continue; }
    if (vistoEmail.has(f.email) || vistoNum.has(f.personnelNumber)) { saltados++; continue; }
    vistoEmail.add(f.email); vistoNum.add(f.personnelNumber);
    try {
      const existente = (await db.usuario.findFirst({ where: { email: f.email } })) as { id: string } | null;
      if (existente) {
        await db.usuario.update({ where: { id: existente.id }, data: { personnelNumber: f.personnelNumber, ...(f.nombre ? { nombre: f.nombre } : {}) } });
        actualizados++;
      } else {
        await db.usuario.create({ data: { email: f.email, personnelNumber: f.personnelNumber, ...(f.nombre ? { nombre: f.nombre } : {}) } });
        creados++;
      }
    } catch (e) {
      errores++;
      console.warn(`  ! ${f.email} / ${f.personnelNumber}: ${(e as Error).message}`);
    }
  }
  console.log(`Empleados: ${creados} nuevos, ${actualizados} actualizados, ${saltados} saltados, ${errores} con error.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
