import { useState, type ReactNode } from "react";

/** Boton que maneja su propio estado de carga: se deshabilita y muestra un spinner
 *  mientras corre la accion async, para evitar doble clic. */
export function AsyncButton({ onClick, children, className = "primary", disabled, loadingText }: {
  onClick: () => Promise<unknown> | unknown;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  loadingText?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    if (busy) return;
    setBusy(true);
    try { await onClick(); } finally { setBusy(false); }
  }
  return (
    <button className={className} disabled={busy || disabled} onClick={handle}>
      {busy && <span className="spinner" />}
      {busy ? (loadingText ?? "Procesando...") : children}
    </button>
  );
}
