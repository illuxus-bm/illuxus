import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgSponsorSearch, type SponsorLite } from "@/hooks/useOrgPeopleSearch";
import { companyNameKey, normalizeWebsite } from "@/lib/intelligence/normalization";

interface Props {
  name: string;
  website: string;
  assignedIds: Set<string>;
  onUse: (sponsor: SponsorLite) => void;
}

/** The organiser's existing records for the same company: same name once normalised, or same website. */
export function findRepeats(results: SponsorLite[], name: string, website: string): SponsorLite[] {
  const key = companyNameKey(name);
  const domain = normalizeWebsite(website)?.domain;
  return results.filter((s) => (key !== "" && companyNameKey(s.name) === key) || (!!domain && normalizeWebsite(s.website)?.domain === domain));
}

/**
 * Shown while adding a sponsor when the organiser already has a record for
 * that company, so they reuse it instead of creating a repeat. It only
 * advises: two different companies can share a name.
 */
export function SponsorRepeatNotice({ name, website, assignedIds, onUse }: Props) {
  // The search matches anywhere in a name, so the first word also finds "Acme Pvt Ltd" from "Acme".
  const firstWord = companyNameKey(name).split(" ")[0] ?? "";
  const domain = normalizeWebsite(website)?.domain ?? "";
  const { data: byName = [] } = useOrgSponsorSearch(firstWord, firstWord.length >= 2);
  const { data: bySite = [] } = useOrgSponsorSearch(domain, !!domain);
  const seen = new Set<string>();
  const repeats = findRepeats([...byName, ...bySite], name, website).filter((s) => !seen.has(s.id) && !!seen.add(s.id));
  if (repeats.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-[13px]" role="status">
      <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> You already have this sponsor</p>
      <ul className="mt-2 space-y-1.5">
        {repeats.slice(0, 3).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{s.name}<span className="text-[11px] text-muted-foreground">{s.website ? ` · ${s.website}` : ""}</span></span>
            {assignedIds.has(s.id)
              ? <span className="shrink-0 text-[12px] text-muted-foreground">Already on this event</span>
              : <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onUse(s)}>Use this sponsor</Button>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">Using it keeps that record as it is; anything typed here isn't applied. If this is a different company, carry on adding it.</p>
    </div>
  );
}

export default SponsorRepeatNotice;
