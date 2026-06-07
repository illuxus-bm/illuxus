import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Code2, Copy, Check, ExternalLink, Layout, AtSign, Globe, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  sanitizeHandleInput,
  validateHandle,
  describeCurrentHost,
  preferredPublicHost,
  publicUrlFor,
} from "@/lib/workspace-handle";

/**
 * Hosts we can advertise as the user's "real" public URL when they're
 * editing inside an internal preview. Order = priority.
 *  1. Custom domain attached at the project level
 *  2. Default published host
 */
const PROJECT_CUSTOM_DOMAIN = "www.illuxus.com";
const PROJECT_PUBLISHED_HOST = "illuxus.com";

const DomainsPage = () => {
  const { org, refreshOrg } = useOrg();
  const { toast } = useToast();
  const [handle, setHandle] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    setHandle(((org as any).subdomain || org.slug || "").toLowerCase());
    setPublished(!!(org as any).landing_published);
  }, [org]);

  const currentHost = typeof window !== "undefined" ? window.location.host : "";
  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";

  const hostInfo = useMemo(() => describeCurrentHost(currentHost), [currentHost]);

  const preferred = useMemo(
    () =>
      preferredPublicHost({
        currentHost,
        customDomain: PROJECT_CUSTOM_DOMAIN,
        publishedHost: PROJECT_PUBLISHED_HOST,
      }),
    [currentHost],
  );

  if (!org) {
    return (
      <DashboardLayout>
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  const pageHandle = handle || org.slug;
  const primaryUrl = publicUrlFor(preferred.host, pageHandle, protocol);
  const sandboxUrl = publicUrlFor(currentHost, pageHandle, protocol);
  const showSandboxRow = hostInfo.isSandbox && currentHost !== preferred.host;

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/org-events`;
  // The embed snippet should always reference the customer-facing host so
  // pasted snippets keep working after the sandbox URL changes.
  const embedScriptUrl = `${protocol}//${preferred.host}/embed.js`;
  const embedSnippet = `<div id="my-events"></div>
<script
  src="${embedScriptUrl}"
  data-org="${pageHandle}"
  data-fn="${fnUrl}"
  data-target="my-events"
  data-filter="${filter}"
  data-limit="10"
  data-theme="light"
  data-api="${protocol}//${preferred.host}"
  defer
></script>`;

  const onHandleChange = (raw: string) => {
    const next = sanitizeHandleInput(raw);
    setHandle(next);
    if (!next) {
      setLiveError(null);
      return;
    }
    const result = validateHandle(next);
    setLiveError(result.ok ? null : result.message);
  };

  const handleSave = async () => {
    const cleaned = handle.trim().toLowerCase();
    const result = validateHandle(cleaned);
    if (!result.ok) {
      setLiveError(result.message);
      toast({ title: "Invalid handle", description: result.message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: clash } = await supabase
      .from("organizations")
      .select("id")
      .or(`subdomain.eq.${cleaned},slug.eq.${cleaned}`)
      .neq("id", org.id)
      .maybeSingle();
    if (clash) {
      setSaving(false);
      const msg = `“${cleaned}” is already taken by another workspace.`;
      setLiveError(msg);
      toast({ title: "Handle taken", description: msg, variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("organizations")
      .update({ subdomain: cleaned, landing_published: published })
      .eq("id", org.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setLiveError(null);
    toast({ title: "Saved", description: `Your workspace is live at ${preferred.host}/org/${cleaned}.` });
    await refreshOrg();
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[900px] space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Workspace URL</h1>
          <p className="text-[13px] text-muted-foreground">
            Your public landing page lives at a unique handle on{" "}
            <span className="font-mono text-foreground/80">{preferred.host}</span>.
          </p>
        </div>

        {/* Handle + landing page */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <AtSign className="h-4 w-4" /> Handle
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Used in your public URL and the event embed widget.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={published} onCheckedChange={setPublished} />
              <span className="text-[12px] font-medium">{published ? "Published" : "Draft"}</span>
            </div>
          </div>

          {/* Primary public URL */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">Public URL</Label>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">
                <Globe className="h-3 w-3" /> Live
              </span>
            </div>
            <div className="mt-1 flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-2.5 inline-flex items-center text-[12px] text-foreground/80 bg-muted font-mono border-r border-input shrink-0">
                {preferred.host}/org/
              </span>
              <input
                value={handle}
                onChange={(e) => onHandleChange(e.target.value)}
                onBlur={() => {
                  if (handle) {
                    const r = validateHandle(handle);
                    setLiveError(r.ok ? null : r.message);
                  }
                }}
                placeholder="acme"
                className="flex-1 min-w-0 h-9 px-2 text-[13px] font-mono bg-transparent outline-none"
                aria-label="Workspace handle"
                aria-invalid={!!liveError}
                aria-describedby="handle-help"
              />
              <button
                onClick={() => copy(primaryUrl, "url")}
                className="px-2.5 inline-flex items-center text-muted-foreground hover:text-foreground bg-muted/50 border-l border-input shrink-0"
                title={`Copy ${primaryUrl}`}
                aria-label="Copy public URL"
              >
                {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            {liveError ? (
              <p
                id="handle-help"
                className="text-[11px] text-destructive mt-1 flex items-start gap-1"
                role="alert"
              >
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                {liveError}
              </p>
            ) : (
              <p id="handle-help" className="text-[11px] text-muted-foreground mt-1">
                2–40 characters · lowercase letters, numbers, hyphens. Must be unique across the platform.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild className="h-8 text-[12px]">
                <Link to="/dashboard/landing-builder">
                  <Layout className="h-3.5 w-3.5 mr-1.5" /> Edit page
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="h-8 text-[12px]">
                <a href={primaryUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View public page
                </a>
              </Button>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !!liveError}
              size="sm"
              className="h-8 text-[13px]"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Embed widget */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Code2 className="h-4 w-4" /> Embed widget
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Auto-updating event listing for any external website.
            </p>
          </div>

          <div className="flex gap-1 p-0.5 rounded-md bg-muted/50 w-fit">
            {(["upcoming", "past", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 h-7 rounded text-[12px] font-medium capitalize ${
                  filter === f ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="relative">
            <pre className="bg-muted/50 border border-border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre">
              {embedSnippet}
            </pre>
            <button
              onClick={() => copy(embedSnippet, "snippet")}
              className="absolute top-2 right-2 h-7 px-2 rounded bg-card border border-border text-[11px] flex items-center gap-1"
            >
              {copied === "snippet" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === "snippet" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DomainsPage;
