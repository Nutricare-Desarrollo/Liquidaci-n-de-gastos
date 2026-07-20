// =====================================================================
//  Acceso a la BD desacoplado del cliente generado por Prisma.
//  Motivo: el typecheck no depende de `prisma generate`. En runtime se
//  instancia el PrismaClient real (corre `npm run prisma:generate` en tu
//  maquina). La interfaz `Db` describe solo las operaciones que usamos.
// =====================================================================
import { createRequire } from "node:module";

/** Delegate estructural (subconjunto del delegate de Prisma). */
export interface Delegate<T = Record<string, unknown>> {
  findUnique(args: { where: Record<string, unknown> }): Promise<T | null>;
  findFirst(args?: unknown): Promise<T | null>;
  findMany(args?: unknown): Promise<T[]>;
  create(args: { data: Record<string, unknown> }): Promise<T>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<T>;
  count(args?: unknown): Promise<number>;
  deleteMany(args?: { where?: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface Db {
  factura: Delegate;
  captura: Delegate;
  liquidacion: Delegate;
  gasto: Delegate;
  usuario: Delegate;
  categoria: Delegate;
  centroCosto: Delegate;
  grupoImpuesto: Delegate;
  reglaMonto: Delegate;
  tarifaKm: Delegate;
  auditoria: Delegate;
  $disconnect(): Promise<void>;
}

let instancia: Db | undefined;

/** Devuelve el cliente Prisma real (singleton), tipado como Db. */
export function getDb(): Db {
  if (!instancia) {
    const require = createRequire(import.meta.url);
    const { PrismaClient } = require("@prisma/client") as { PrismaClient: new () => Db };
    instancia = new PrismaClient();
  }
  return instancia;
}
