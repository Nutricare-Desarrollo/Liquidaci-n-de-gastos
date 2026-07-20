import { useState } from "react";

/** Logo corporativo (imagen fija en /public). Si no existe, cae a la "N" de marca. */
export function BrandLogo() {
  const [err, setErr] = useState(false);
  if (err) return <>N</>;
  return <img src="/nutricare-logo.png" alt="Nutricare" onError={() => setErr(true)} />;
}
