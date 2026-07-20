import { useEffect, useState } from "react";

export interface ComboOption { value: string; label: string; hint?: string }

/** Combo con busqueda: filtra conforme se escribe (como el UsuarioPicker). */
export function Combo({ options, value, onChange, placeholder, max = 10 }: {
  options: ComboOption[]; value: string; onChange: (v: string) => void; placeholder?: string; max?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const s = options.find((o) => o.value === value);
    setQ(s ? s.label : "");
  }, [value, options]);

  const ql = q.trim().toLowerCase();
  const matches = options
    .filter((o) => !ql || o.label.toLowerCase().includes(ql) || (o.hint ?? "").toLowerCase().includes(ql))
    .slice(0, max);

  return (
    <div className="combo">
      <input
        value={q}
        placeholder={placeholder ?? "Escribi para buscar..."}
        onFocus={() => { setQ(""); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="combo-list">
          {matches.map((o) => (
            <li key={o.value} onMouseDown={() => { onChange(o.value); setQ(o.label); setOpen(false); }}>
              {o.label}{o.hint ? <small className="mono"> · {o.hint}</small> : null}
            </li>
          ))}
        </ul>
      )}
      {open && matches.length === 0 && <ul className="combo-list"><li className="empty">Sin coincidencias</li></ul>}
    </div>
  );
}
