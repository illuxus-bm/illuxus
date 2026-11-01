import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseRpc } from "@/lib/observability";

interface Suggestion {
  field: string;
  current_value: string | null;
  suggested_value: string;
}

const LABELS: Record<string, string> = {
  title: "Title",
  first_name: "First name",
  last_name: "Last name",
  designation: "Designation",
  company: "Company",
  mobile_country_code: "Country code",
  mobile_number: "Mobile number",
  linkedin_url: "LinkedIn",
};

/**
 * Where details an organiser entered for you (as a speaker, sponsor contact
 * or team invitee) differ from your profile — `my_profile_suggestions`,
 * migration 062. Nothing changes unless you choose "Use this"; "Keep mine"
 * hides that suggestion for good. Both are recorded in the audit log.
 * Renders nothing when there is nothing to suggest.
 */
export function ProfileSuggestions() {
  const { refreshProfile } = useAuth();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabaseRpc<Suggestion[]>("my_profile_suggestions");
    setItems(!e && Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (field: string, apply: boolean) => {
    setBusy(field);
    setError(null);
    const { error: e } = await supabaseRpc(apply ? "apply_profile_suggestion" : "dismiss_profile_suggestion", { _field: field });
    setBusy(null);
    if (e) { setError("That didn't work. Please try again."); return; }
    if (apply) await refreshProfile();
    await load();
  };

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="profile-suggestions-title" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 id="profile-suggestions-title" className="text-sm font-semibold">Organisers have different details for you</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        Your profile stays as it is unless you choose to update it.
      </p>
      <ul className="mt-3 divide-y divide-border/70">
        {items.map((s) => (
          <li key={s.field} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="font-medium">{LABELS[s.field] ?? s.field}</div>
              <div className="text-muted-foreground">
                Yours: <span className="text-foreground">{s.current_value || "—"}</span>
                <span className="mx-1.5" aria-hidden>·</span>
                Organiser's: <span className="text-foreground">{s.suggested_value}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void act(s.field, true)} disabled={busy !== null}>Use this</Button>
              <Button size="sm" variant="outline" onClick={() => void act(s.field, false)} disabled={busy !== null}>Keep mine</Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-destructive">{error}</p>}
    </section>
  );
}

export default ProfileSuggestions;
