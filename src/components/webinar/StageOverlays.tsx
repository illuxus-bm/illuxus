import { memo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Branding = {
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  lower_third?: { title?: string; subtitle?: string; visible?: boolean };
  banner?: { text?: string; visible?: boolean; position?: "top" | "bottom" };
  background_url?: string | null;
};

export function useSessionBranding(sessionId?: string): Branding | undefined {
  const [b, setB] = useState<Branding | undefined>();
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    supabase.from("webinar_sessions").select("branding").eq("id", sessionId).maybeSingle()
      .then(({ data }) => { if (active) setB((data?.branding as Branding) || {}); });
    const ch = supabase.channel(`brand-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "webinar_sessions", filter: `id=eq.${sessionId}` },
        (p: any) => setB((p.new?.branding as Branding) || {}))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [sessionId]);
  return b;
}

function StageOverlaysImpl({ branding, screenSharing }: { branding?: Branding; screenSharing?: boolean }) {
  if (!branding) return null;
  const accent = branding.accent_color || "#22c55e";
  const primary = branding.primary_color || "#0ea5e9";
  const lt = branding.lower_third;
  const bn = branding.banner;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {branding.logo_url && (
        <img src={branding.logo_url} alt="" className="absolute top-3 left-3 h-9 w-auto rounded shadow-lg" />
      )}
      {screenSharing && (
        <div className="absolute top-3 right-3 bg-black/70 text-white text-[11px] px-2 py-1 rounded backdrop-blur">
          🖥️ Presenter is sharing
        </div>
      )}
      {bn?.visible && bn.text && (
        <div
          className={`absolute left-0 right-0 ${bn.position === "bottom" ? "bottom-20" : "top-0"} overflow-hidden text-white text-sm`}
          style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }}
        >
          <div className="whitespace-nowrap py-1.5 px-4 animate-marquee">{bn.text}</div>
        </div>
      )}
      {lt?.visible && (lt.title || lt.subtitle) && (
        <div className="absolute bottom-24 left-6 max-w-md">
          <div className="bg-black/70 backdrop-blur text-white px-4 py-2 rounded-r-lg border-l-4 shadow-xl"
               style={{ borderColor: accent }}>
            {lt.title && <div className="font-semibold leading-tight">{lt.title}</div>}
            {lt.subtitle && <div className="text-xs opacity-80 mt-0.5">{lt.subtitle}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export const StageOverlays = memo(StageOverlaysImpl);