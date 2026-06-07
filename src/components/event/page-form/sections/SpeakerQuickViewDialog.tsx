import { User, Building2 } from "lucide-react";
import type { RendererSpeaker } from "../PublicEventRenderer";
import QuickViewDialog from "./QuickViewDialog";

export default function SpeakerQuickViewDialog({
  speaker, open, onOpenChange,
}: {
  speaker: RendererSpeaker | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!speaker) return null;
  const subtitleText = [speaker.designation, speaker.company].filter(Boolean).join(" · ");
  return (
    <QuickViewDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="Speaker"
      media={
        <div className="h-32 w-32 rounded-2xl border border-border bg-muted flex items-center justify-center overflow-hidden aspect-square shrink-0">
          {speaker.photo_url ? (
            <img src={speaker.photo_url} alt={speaker.name} className="h-full w-full object-cover" />
          ) : (
            <User className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
      }
      badge={speaker.title || "Speaker"}
      title={speaker.name}
      subtitle={
        subtitleText ? (
          <span className="flex items-center gap-1.5">
            {speaker.company && <Building2 className="h-4 w-4 shrink-0" />}
            <span className="break-words">{subtitleText}</span>
          </span>
        ) : undefined
      }
      bodyLabel={speaker.bio ? "About" : undefined}
      body={speaker.bio || undefined}
    />
  );
}