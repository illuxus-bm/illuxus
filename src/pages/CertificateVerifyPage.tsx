/**
 * CertificateVerifyPage — what a certificate's QR code opens
 * (`/certificates/<code>`). Anyone can confirm a certificate is genuine; the
 * holder can download it. A revoked certificate says so and cannot be
 * downloaded.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, Download, Loader2, ShieldX, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { getPublicCertificate, type PublicCertificate } from "@/lib/certificates/certificate-api";
import { parseDesign } from "@/lib/certificates/certificate-design";
import { certificateCanvas, certificatePdf, downloadBlob, safeFileName } from "@/lib/certificates/certificate-pdf";
import { PREVIEW_DPI } from "@/lib/brochure/editor/editor-pdf";

const fmt = (iso?: string) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : "");

export default function CertificateVerifyPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [cert, setCert] = useState<PublicCertificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    getPublicCertificate(code).then((c) => { if (alive) setCert(c); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [code]);

  const design = cert?.status === "issued" ? parseDesign(cert.design, cert.settings) : null;

  useEffect(() => {
    if (!design || !cert?.code) return;
    let alive = true;
    void certificateCanvas(design, cert.field_values ?? {}, cert.code, PREVIEW_DPI * 1.3)
      .then((canvas) => { if (alive) setImg(canvas.toDataURL("image/png")); })
      .catch(() => undefined);
    return () => { alive = false; };
    // The design is parsed from `cert`, which only changes once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cert]);

  const download = async () => {
    if (!design || !cert?.code) return;
    setDownloading(true);
    try {
      const { blob } = await certificatePdf(design, cert.field_values ?? {}, cert.code);
      downloadBlob(blob, `${safeFileName(cert.recipient_name ?? "certificate")}-${cert.code}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-shell min-h-screen px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle size="sm" /></div>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex" aria-label="illuxus home"><IlluxusWordmark height={24} ariaLabel="" /></Link>
          <p className="mt-2 text-[12px] uppercase tracking-[0.18em] text-muted-foreground">Certificate verification</p>
        </div>

        {!cert && !error && (
          <p className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking certificate…</p>
        )}

        {(error || cert?.found === false) && (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <SearchX className="mx-auto h-9 w-9 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-semibold">Certificate not found</h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">
              No certificate has the ID <span className="font-mono text-foreground">{code.toUpperCase()}</span>. Check it was copied exactly as printed.
            </p>
          </div>
        )}

        {cert?.found && cert.status === "revoked" && (
          <div className="rounded-3xl border border-destructive/30 bg-card p-8 text-center">
            <ShieldX className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 text-xl font-semibold">This certificate has been revoked</h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">
              Certificate <span className="font-mono text-foreground">{cert.code}</span>, issued to {cert.recipient_name} for {cert.event_name} by {cert.organization_name}, was revoked on {fmt(cert.revoked_at)} and is no longer valid.
            </p>
          </div>
        )}

        {cert?.found && cert.status === "issued" && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-emerald-500/30 bg-card p-6 sm:p-8">
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
                <BadgeCheck className="h-10 w-10 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-semibold">Valid certificate</h1>
                  <p className="mt-1 text-[13.5px] text-muted-foreground">
                    Issued to <span className="font-medium text-foreground">{cert.recipient_name}</span> for <span className="font-medium text-foreground">{cert.event_name}</span> by {cert.organization_name} on {fmt(cert.issued_at)}.
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-muted-foreground">{cert.code}</p>
                </div>
                {design && (
                  <Button size="sm" className="gap-1.5 shrink-0" onClick={() => void download()} disabled={downloading}>
                    {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF
                  </Button>
                )}
              </div>
            </div>
            {img && <img src={img} alt={`Certificate for ${cert.recipient_name}`} className="w-full rounded-lg bg-white shadow-[0_24px_60px_-30px_rgb(0_0_0/0.4)]" />}
          </div>
        )}
      </div>
    </div>
  );
}
