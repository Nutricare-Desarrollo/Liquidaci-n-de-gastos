import { useEffect, useState } from "react";
import type { Usuario } from "./api.js";

/** Selector con busqueda (escribir para filtrar) para elegir un usuario/aprobador. */
export function UsuarioPicker({ usuarios, value, onChange, placeholder }: {
  usuarios: Usuario[]; value: string; onChange: (id: string) => void; placeholder?: string;
}) {
  const label = (u: Usuario) => u.nombre ?? u.email;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const s = usuarios.find((u) => u.id === value);
    setQ(s ? label(s) : "");
  }, [value, usuarios]);

  const ql = q.trim().toLowerCase();
  const matches = usuarios
    .filter((u) => !ql || (u.nombre ?? "").toLowerCase().includes(ql) || u.email.toLowerCase().includes(ql))
    .slice(0, 8);

  return (
    <div className="combo">
      <input
        value={q}
        placeholder={placeholder ?? "Escribi para buscar..."}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="combo-list">
          {matches.map((u) => (
            <li key={u.id} onMouseDown={() => { onChange(u.id); setQ(label(u)); setOpen(false); }}>
              {label(u)}{u.nombre ? <small className="mono"> · {u.email}</small> : null}
            </li>
          ))}
        </ul>
      )}
      {open && matches.length === 0 && <ul className="combo-list"><li className="empty">Sin coincidencias</li></ul>}
    </div>
  );
}
