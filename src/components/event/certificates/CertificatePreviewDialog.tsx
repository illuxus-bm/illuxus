/**
 * A large preview of a design, drawn by the PDF renderer, for sample data or
 * one of the event's attendees.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PREVIEW_DPI } from "@/lib/brochure/editor/editor-pdf";
import type { CertificateDesign } from "@/lib/certificates/certificate-design";
import { SAMPLE_PARTICIPANTS, type CertificateValues } from "@/lib/certificates/certificate-fields";
import { PREVIEW_CODE, certificateCanvas } from "@/lib/certificates/certificate-pdf";
import { previewValues, type EventContext, type Registrant } from "@/lib/certificates/certificate-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  design: CertificateDesign | null;
  event: EventContext;
  registrants?: Registrant[];
  /** Preview this attendee first. */
  initialWho?: string;
  /** Show real stored values instead of choosing (an issued certificate). */
  fixedValues?: { values: CertificateValues; code: string };
  footer?: ReactNode;
}

export default function CertificatePreviewDialog(props: Props) {
  const { design, event } = props;
  const [who, setWho] = useState(props.initialWho ?? "sample:0");
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => { if (props.open) setWho(props.initialWho ?? "sample:0"); }, [props.open, props.initialWho]);

  const real = useMemo(() => (props.registrants ?? []).filter((r) => r.eligible).slice(0, 100), [props.registrants]);

  useEffect(() => {
    if (!props.open || !design) return;
    let alive = true;
    setImg(null);
    void (async () => {
      let values: CertificateValues;
      let code: string | null = null;
      if (props.fixedValues) { values = props.fixedValues.values; code = props.fixedValues.code; }
      else if (who.startsWith("sample:")) {
        const s = SAMPLE_PARTICIPANTS[Number(who.slice(7))] ?? SAMPLE_PARTICIPANTS[0];
        values = { ...s.values, event_name: event.title || s.values.event_name, organization_name: event.org_name || s.values.organization_name, certificate_type: design.settings.certificateType };
      } else {
        const r = real.find((x) => x.id === who);
        values = r ? { ...previewValues(r, event, design.settings.certificateType), certificate_id: PREVIEW_CODE } : SAMPLE_PARTICIPANTS[0].values;
      }
      const canvas = await certificateCanvas(design, values, code, PREVIEW_DPI * 1.4);
      if (alive) setImg(canvas.toDataURL("image/png"));
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [props.open, design, who, event, real, props.fixedValues]);

  const page = design?.document.pages[0];

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[min(1100px,96vw)] gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{props.title}</DialogTitle>
          {props.subtitle && <DialogDescription className="text-[12.5px]">{props.subtitle}</DialogDescription>}
        </DialogHeader>
        {!props.fixedValues && (
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="h-8 w-full sm:w-[280px] text-[12.5px]" aria-label="Preview as"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Sample data</SelectLabel>
                {SAMPLE_PARTICIPANTS.map((s, i) => <SelectItem key={i} value={`sample:${i}`}>{s.label}</SelectItem>)}
              </SelectGroup>
              {real.length > 0 && (
                <SelectGroup>
                  <SelectLabel>This event's attendees</SelectLabel>
                  {real.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.checked_in ? " · checked in" : ""}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        )}
        <div className="flex min-h-[240px] items-center justify-center rounded-lg bg-muted/50 p-3 sm:p-5">
          {img && page ? (
            <img src={img} alt="Certificate preview" className="max-h-[68vh] w-auto max-w-full bg-white shadow-[0_16px_48px_-24px_rgb(0_0_0/0.45)]" style={{ aspectRatio: `${page.width} / ${page.height}` }} />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
        {props.footer && <DialogFooter className="gap-2 sm:gap-2">{props.footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
