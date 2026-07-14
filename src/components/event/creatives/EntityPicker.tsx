/**
 * EntityPicker — speaker / sponsor / combo-pair picker for the Creative_Generator.
 *
 * Fetches the event's linked speakers/sponsors the same way
 * `SpeakerManagement.tsx`/`SponsorManagement.tsx` do: join through
 * `event_speakers`/`event_sponsors` to get the ordered set of linked ids,
 * then fetch the full rows by id. Supports three modes:
 *  - "speaker": pick one speaker
 *  - "sponsor": pick one sponsor
 *  - "combo": pick one speaker AND one sponsor
 */
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import type { SpeakerLike, SponsorLike } from "@/lib/creatives/creative-renderer";

interface EntityPickerProps {
  eventId: string;
  mode: "speaker" | "sponsor" | "combo";
  speakerId?: string | null;
  sponsorId?: string | null;
  onSpeakerChange?: (speaker: SpeakerLike | null) => void;
  onSponsorChange?: (sponsor: SponsorLike | null) => void;
}

export default function EntityPicker({
  eventId,
  mode,
  speakerId,
  sponsorId,
  onSpeakerChange,
  onSponsorChange,
}: EntityPickerProps) {
  const [speakers, setSpeakers] = useState<SpeakerLike[]>([]);
  const [sponsors, setSponsors] = useState<SponsorLike[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        if (mode === "speaker" || mode === "combo") {
          const { data: links } = await supabase
            .from("event_speakers")
            .select("speaker_id, display_order")
            .eq("event_id", eventId)
            .order("display_order");
          const ids = (links ?? []).map((l) => l.speaker_id);
          if (ids.length > 0) {
            const { data: rows, error } = await supabase.from("speakers").select("*").in("id", ids);
            if (error) {
              logger.error("entity picker speakers fetch failed", {
                event_id: eventId,
                error_message: error.message,
              });
            }
            if (mounted) setSpeakers((rows ?? []) as SpeakerLike[]);
          } else if (mounted) {
            setSpeakers([]);
          }
        }

        if (mode === "sponsor" || mode === "combo") {
          const { data: links } = await supabase
            .from("event_sponsors")
            .select("sponsor_id, display_order")
            .eq("event_id", eventId)
            .order("display_order");
          const ids = (links ?? []).map((l) => l.sponsor_id);
          if (ids.length > 0) {
            const { data: rows, error } = await supabase.from("sponsors").select("*").in("id", ids);
            if (error) {
              logger.error("entity picker sponsors fetch failed", {
                event_id: eventId,
                error_message: error.message,
              });
            }
            if (mounted) setSponsors((rows ?? []) as SponsorLike[]);
          } else if (mounted) {
            setSponsors([]);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [eventId, mode]);

  if (loading) {
    return <p className="text-[12px] text-muted-foreground py-4 text-center">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      {(mode === "speaker" || mode === "combo") && (
        <SpeakerSelect
          speakers={speakers}
          value={speakerId ?? null}
          onChange={(id) => onSpeakerChange?.(speakers.find((s) => s.id === id) ?? null)}
        />
      )}
      {(mode === "sponsor" || mode === "combo") && (
        <SponsorSelect
          sponsors={sponsors}
          value={sponsorId ?? null}
          onChange={(id) => onSponsorChange?.(sponsors.find((s) => s.id === id) ?? null)}
        />
      )}
    </div>
  );
}

function SpeakerSelect({
  speakers,
  value,
  onChange,
}: {
  speakers: SpeakerLike[];
  value: string | null;
  onChange?: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Speaker</Label>
      {speakers.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic">No speakers assigned to this event yet.</p>
      ) : (
        <Select value={value ?? undefined} onValueChange={(v) => onChange?.(v)}>
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder="Select a speaker" />
          </SelectTrigger>
          <SelectContent>
            {speakers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function SponsorSelect({
  sponsors,
  value,
  onChange,
}: {
  sponsors: SponsorLike[];
  value: string | null;
  onChange?: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Sponsor</Label>
      {sponsors.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic">No sponsors assigned to this event yet.</p>
      ) : (
        <Select value={value ?? undefined} onValueChange={(v) => onChange?.(v)}>
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder="Select a sponsor" />
          </SelectTrigger>
          <SelectContent>
            {sponsors.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
