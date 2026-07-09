// Los montos del XML llegan como texto con formatos irregulares:
// "38019", "44642.0000", ".0000", "0.00000". Forzar a numero siempre,
// con default 0 (leccion aprendida: comparar impuestos como numero, no texto).
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
