// =====================================================================
//  Db en memoria para modo demo (sin Postgres). Implementa la interfaz
//  Db/Delegate con arreglos. Soporta where por igualdad, include simple
//  (gasto.categoria) y create/update. NO es para produccion.
// =====================================================================
import type { Db, Delegate } from "../../db/client.js";

type Rec = Record<string, unknown>;

function cuid(): string {
  return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function matchWhere(rec: Rec, where?: Rec): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v === null) return rec[k] === null || rec[k] === undefined;
    return rec[k] === v;
  });
}

class InMemoryDelegate implements Delegate {
  constructor(
    private readonly store: Rec[],
    private readonly defaults: Rec = {},
    private readonly resolveInclude?: (rec: Rec, include: Rec) => Rec,
  ) {}

  private withInclude(rec: Rec, args?: unknown): Rec {
    const include = (args as { include?: Rec } | undefined)?.include;
    if (include && this.resolveInclude) return this.resolveInclude(rec, include);
    return rec;
  }

  async findUnique(args: { where: Rec }): Promise<Rec | null> {
    const r = this.store.find((x) => matchWhere(x, args.where));
    return r ? this.withInclude(r, args) : null;
  }
  async findFirst(args?: unknown): Promise<Rec | null> {
    const where = (args as { where?: Rec } | undefined)?.where;
    const r = this.store.find((x) => matchWhere(x, where));
    return r ? this.withInclude(r, args) : null;
  }
  async findMany(args?: unknown): Promise<Rec[]> {
    const where = (args as { where?: Rec } | undefined)?.where;
    return this.store.filter((x) => matchWhere(x, where)).map((r) => this.withInclude(r, args));
  }
  async create(args: { data: Rec }): Promise<Rec> {
    const rec: Rec = { id: cuid(), createdAt: new Date(), ...this.defaults, ...args.data };
    if (rec["id"] === undefined) rec["id"] = cuid();
    this.store.push(rec);
    return rec;
  }
  async update(args: { where: Rec; data: Rec }): Promise<Rec> {
    const r = this.store.find((x) => matchWhere(x, args.where));
    if (!r) throw new Error("update: no encontrado");
    Object.assign(r, args.data);
    return r;
  }
  async count(args?: unknown): Promise<number> {
    const where = (args as { where?: Rec } | undefined)?.where;
    return this.store.filter((x) => matchWhere(x, where)).length;
  }
  async deleteMany(args?: { where?: Rec }): Promise<{ count: number }> {
    const where = args?.where;
    let count = 0;
    for (let i = this.store.length - 1; i >= 0; i--) {
      if (matchWhere(this.store[i] as Rec, where)) { this.store.splice(i, 1); count++; }
    }
    return { count };
  }
}

export class InMemoryDb implements Db {
  readonly stores = {
    factura: [] as Rec[],
    captura: [] as Rec[],
    liquidacion: [] as Rec[],
    gasto: [] as Rec[],
    usuario: [] as Rec[],
    categoria: [] as Rec[],
    centroCosto: [] as Rec[],
    grupoImpuesto: [] as Rec[],
    reglaMonto: [] as Rec[],
    tarifaKm: [] as Rec[],
    auditoria: [] as Rec[],
  };

  factura = new InMemoryDelegate(this.stores.factura, { estado: "SIN_CAPTURA", esDeLaEmpresa: false });
  captura = new InMemoryDelegate(this.stores.captura, { estado: "PENDIENTE_OCR" });
  liquidacion = new InMemoryDelegate(this.stores.liquidacion, { estado: "BORRADOR", montoInforme: 0 });
  gasto = new InMemoryDelegate(this.stores.gasto, {}, (rec, include) => {
    const out = { ...rec };
    if (include["categoria"]) out["categoria"] = this.stores.categoria.find((c) => c["id"] === rec["categoriaId"]) ?? null;
    if (include["factura"]) out["factura"] = this.stores.factura.find((f) => f["id"] === rec["facturaId"]) ?? null;
    return out;
  });
  usuario = new InMemoryDelegate(this.stores.usuario);
  categoria = new InMemoryDelegate(this.stores.categoria, { activo: true });
  centroCosto = new InMemoryDelegate(this.stores.centroCosto);
  grupoImpuesto = new InMemoryDelegate(this.stores.grupoImpuesto);
  reglaMonto = new InMemoryDelegate(this.stores.reglaMonto, { activo: true });
  tarifaKm = new InMemoryDelegate(this.stores.tarifaKm, { activo: true, montoPorKm: 0 });
  auditoria = new InMemoryDelegate(this.stores.auditoria);

  async $disconnect(): Promise<void> {}
}
