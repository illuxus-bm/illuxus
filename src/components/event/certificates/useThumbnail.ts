import { useEffect, useState } from "react";
import { cachedThumbnail, thumbnail } from "@/lib/certificates/certificate-pdf";
import type { CertificateDesign } from "@/lib/certificates/certificate-design";
import { SAMPLE_PARTICIPANTS } from "@/lib/certificates/certificate-fields";

/** A rendered thumbnail of a design, drawn once per `key` and cached. */
export function useThumbnail(key: string, build: () => CertificateDesign | null): string | null {
  const [url, setUrl] = useState<string | null>(() => cachedThumbnail(key) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = cachedThumbnail(key);
    if (hit) { setUrl(hit); return; }
    setUrl(null);
    const design = build();
    if (!design) return;
    void thumbnail(design, SAMPLE_PARTICIPANTS[0].values, key).then((u) => { if (alive) setUrl(u || null); }).catch(() => undefined);
    return () => { alive = false; };
    // `build` is recreated each render; the key identifies the design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
