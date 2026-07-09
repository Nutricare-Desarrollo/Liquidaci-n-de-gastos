import type { Db } from "../db/client.js";
import type { UsuarioDir, UsuariosPort } from "../ports/index.js";

// Directorio de usuarios desde la BD (usado en modo demo).
export class DbUsuarios implements UsuariosPort {
  constructor(private readonly db: Db) {}
  async listar(): Promise<UsuarioDir[]> {
    const rows = (await this.db.usuario.findMany()) as Array<Record<string, unknown>>;
    return rows.map((u) => ({
      id: String(u["id"]), email: String(u["email"]),
      nombre: (u["nombre"] as string | undefined) ?? undefined,
      personnelNumber: (u["personnelNumber"] as string | undefined) ?? undefined,
    }));
  }
}
