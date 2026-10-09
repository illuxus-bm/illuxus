/**
 * Partners — who each tracked link of the event is shared with.
 *
 * Organisers invite a partner (agency) by email to ONE tracked link, choose
 * what the partner may do, and see how that link is performing. From here
 * they can also change permissions, resend the invitation, or revoke access.
 * The partner signs in with a normal account and opens "Partner dashboard"
 * from the profile menu.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Handshake, Mail, MoreHorizontal, Pencil, Plus, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_PARTNER_PERMISSIONS, PERMISSION_OPTIONS, isPartnerFeatureMissing, linkLabel, listPartnerShares,
  partnerDashboardUrl, partnerErrorMessage, revokePartnerShare, sendPartnerInviteEmail, sharePartnerLink,
  updatePartnerShare, PARTNER_NEEDS_DB_UPDATE,
  type PartnerPermissions, type PartnerShare,
} from "@/lib/utm/partner-access";
import { PartnerEmailField, PartnerPermissionFields, isEmail } from "./UtmPartnerFields";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface ShareableLink {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  label?: string | null;
}

export const partnerSharesKey = (eventId: string) => ["utm-partners", eventId] as const;

const keyOf = (l: ShareableLink) => `${l.utm_source}\u0001${l.utm_medium}\u0001${l.utm_campaign}`;

const STATUS_STYLE: Record<PartnerShare["status"], { label: string; className: string }> = {
  pending: { label: "Invited", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  accepted: { label: "Active", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  revoked: { label: "Revoked", className: "bg-muted text-muted-foreground border-border" },
};

/** Share a link, then email the invitation. Shared by this section and the tracked-link dialog. */
export async function shareAndInvite(
  eventId: string, link: ShareableLink, email: string, permissions: PartnerPermissions, inviterEmail: string | null | undefined,
): Promise<boolean> {
  let share: PartnerShare;
  try {
    share = await sharePartnerLink(eventId, link, email.trim().toLowerCase(), permissions);
  } catch (e) {
    toast.error("Couldn't share the link", { description: partnerErrorMessage(e as { code?: string; message?: string }), duration: 12_000 });
    return false;
  }
  if (!share.created) {
    toast.success("Partner access updated", { description: `${share.invited_email} already had this link.` });
    return true;
  }
  toast.success("Link shared", { description: `Inviting ${share.invited_email}…` });
  void sendPartnerInviteEmail(share, share.event_title, inviterEmail).then((problem) => {
    if (problem) {
      toast.warning("Shared, but the invitation email wasn't sent", {
        description: `${problem}. ${share.invited_email} can still open Partner dashboard from their profile menu after signing in — or use "Copy invite link".`,
        duration: 15_000,
      });
    }
  });
  return true;
}

export function UtmPartnersSection({ eventId, links }: { eventId: string; links: ShareableLink[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: shares = [], error, isLoading } = useQuery<PartnerShare[]>({
    queryKey: partnerSharesKey(eventId),
    queryFn: () => listPartnerShares(eventId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: partnerSharesKey(eventId) });

  const [shareOpen, setShareOpen] = useState(false);
  const [linkKey, setLinkKey] = useState("");
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<PartnerPermissions>(DEFAULT_PARTNER_PERMISSIONS);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PartnerShare | null>(null);
  const [editPerms, setEditPerms] = useState<PartnerPermissions>(DEFAULT_PARTNER_PERMISSIONS);
  const [revoking, setRevoking] = useState<PartnerShare | null>(null);

  const linkByKey = useMemo(() => new Map(links.map((l) => [keyOf(l), l])), [links]);
  const missing = isPartnerFeatureMissing(error as { code?: string; message?: string } | null);

  const openShare = () => {
    setLinkKey(links[0] ? keyOf(links[0]) : "");
    setEmail("");
    setPerms(DEFAULT_PARTNER_PERMISSIONS);
    setShareOpen(true);
  };

  const submitShare = async () => {
    const link = linkByKey.get(linkKey);
    if (!link || !isEmail(email) || busy) return;
    setBusy(true);
    const ok = await shareAndInvite(eventId, link, email, perms, user?.email);
    setBusy(false);
    if (ok) { setShareOpen(false); refresh(); }
  };

  const saveEdit = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await updatePartnerShare(editing.id, editPerms);
      toast.success("Permissions updated", { description: "They apply the next time the partner's dashboard refreshes." });
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error("Couldn't update permissions", { description: partnerErrorMessage(e as { message?: string }) });
    } finally { setBusy(false); }
  };

  const confirmRevoke = async () => {
    if (!revoking || busy) return;
    setBusy(true);
    try {
      await revokePartnerShare(revoking.id);
      toast.success("Access revoked", { description: `${revoking.invited_email} can no longer see this link.` });
      setRevoking(null);
      refresh();
    } catch (e) {
      toast.error("Couldn't revoke access", { description: partnerErrorMessage(e as { message?: string }) });
    } finally { setBusy(false); }
  };

  const resend = async (s: PartnerShare) => {
    toast.message("Sending the invitation…", { description: s.invited_email });
    const problem = await sendPartnerInviteEmail(s, null, user?.email);
    if (problem) toast.warning("The invitation email wasn't sent", { description: problem, duration: 12_000 });
    else toast.success("Invitation sent", { description: s.invited_email });
  };

  const reshare = async (s: PartnerShare) => {
    const ok = await shareAndInvite(eventId, s, s.invited_email, s, user?.email);
    if (ok) refresh();
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(partnerDashboardUrl()); toast.success("Invite link copied", { description: "The partner signs in with the invited email." }); }
    catch { toast.error("Couldn't copy", { description: partnerDashboardUrl() }); }
  };

  return (
    <section className="rounded-xl border border-border bg-card" aria-label="Partners">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Handshake className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-tight">Partners</h3>
            <p className="text-[12px] text-muted-foreground leading-snug">
              Share one tracked link with an agency. They see and register only that link's participants.
            </p>
          </div>
        </div>
        <Button size="sm" className="h-9 sm:h-8 gap-1.5 text-[12px] shrink-0" onClick={openShare} disabled={links.length === 0 || missing}>
          <Plus className="h-3.5 w-3.5" /> Share with partner
        </Button>
      </div>

      {missing ? (
        <p className="px-4 py-5 text-[13px] text-amber-700 dark:text-amber-400">{PARTNER_NEEDS_DB_UPDATE}</p>
      ) : error ? (
        <p className="px-4 py-5 text-[13px] text-destructive">Couldn't load partners: {partnerErrorMessage(error as { message?: string })}</p>
      ) : isLoading ? (
        <p className="px-4 py-5 text-[13px] text-muted-foreground">Loading partners…</p>
      ) : shares.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground text-center">
          {links.length === 0
            ? "Create a tracked link first, then share it with a partner."
            : "No links are shared yet. Use “Share with partner” to invite an agency to one of your tracked links."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {shares.map((s) => {
            const st = STATUS_STYLE[s.status];
            const perms = PERMISSION_OPTIONS.filter((o) => s[o.key]).map((o) => o.label);
            return (
              <li key={s.id} className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${s.status === "revoked" ? "opacity-70" : ""}`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium break-all">{s.partner_name ? `${s.partner_name} · ${s.invited_email}` : s.invited_email}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${st.className}`}>{st.label}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground break-all">
                    Link: <span className="text-foreground">{linkLabel(s)}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {s.status === "revoked" ? "No access" : perms.length ? `View · ${perms.join(" · ")}` : "View only"}
                  </p>
                </div>
                <dl className="grid grid-cols-4 gap-3 text-center shrink-0 sm:w-[300px]">
                  {[
                    ["Registered", s.stats.total],
                    ["Approved", s.stats.approved ?? 0],
                    ["Checked in", s.stats.checked_in ?? 0],
                    ["Added by them", s.registered_by_partner],
                  ].map(([label, value]) => (
                    <div key={label as string} className="min-w-0">
                      <dd className="text-[15px] font-semibold tabular-nums leading-tight">{Number(value).toLocaleString()}</dd>
                      <dt className="text-[10px] text-muted-foreground leading-tight">{label}</dt>
                    </div>
                  ))}
                </dl>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 self-end sm:self-auto" aria-label={`Manage ${s.invited_email}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {s.status === "revoked" ? (
                      <DropdownMenuItem onClick={() => void reshare(s)}><Mail className="h-3.5 w-3.5 mr-2" /> Share again</DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => { setEditPerms({ can_register: s.can_register, can_view_approval: s.can_view_approval, can_view_checkin: s.can_view_checkin, can_export: s.can_export }); setEditing(s); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Change permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void resend(s)}><Mail className="h-3.5 w-3.5 mr-2" /> Resend invitation</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyInvite()}><Copy className="h-3.5 w-3.5 mr-2" /> Copy invite link</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRevoking(s)} className="text-destructive focus:text-destructive">
                          <ShieldOff className="h-3.5 w-3.5 mr-2" /> Revoke access
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {/* Share a link */}
      <Dialog open={shareOpen} onOpenChange={(o) => { if (!busy) setShareOpen(o); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-base pr-8"><Handshake className="h-4 w-4 shrink-0" /> Share with partner</DialogTitle>
            <DialogDescription className="text-[12px]">
              The partner gets a dashboard for this one link only. Other links and the rest of the event stay private.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-[12px] sm:text-[11px]">Tracked link</Label>
              <Select value={linkKey} onValueChange={setLinkKey}>
                <SelectTrigger className="h-11 sm:h-9 text-base sm:text-[13px]"><SelectValue placeholder="Choose a link" /></SelectTrigger>
                <SelectContent>
                  {links.map((l) => (
                    <SelectItem key={keyOf(l)} value={keyOf(l)}>{l.label ? `${l.label} — ${linkLabel(l)}` : linkLabel(l)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PartnerEmailField value={email} onChange={setEmail} id="share-partner-email" />
            <PartnerPermissionFields value={perms} onChange={setPerms} idPrefix="share" />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => setShareOpen(false)} disabled={busy}>Cancel</Button>
            <Button className="h-11 sm:h-9" onClick={() => void submitShare()} disabled={busy || !linkKey || !isEmail(email)}>
              {busy ? "Sharing…" : "Share & send invitation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change permissions */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o && !busy) setEditing(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base pr-8">Change permissions</DialogTitle>
            <DialogDescription className="text-[12px] break-all">
              {editing?.invited_email} · {editing ? linkLabel(editing) : ""}
            </DialogDescription>
          </DialogHeader>
          <PartnerPermissionFields value={editPerms} onChange={setEditPerms} idPrefix="edit" />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button className="h-11 sm:h-9" onClick={() => void saveEdit()} disabled={busy}>{busy ? "Saving…" : "Save permissions"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <AlertDialog open={revoking !== null} onOpenChange={(o) => { if (!o && !busy) setRevoking(null); }}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this partner's access?</AlertDialogTitle>
            <AlertDialogDescription className="text-left break-words">
              {revoking?.invited_email} will immediately lose access to {revoking ? linkLabel(revoking) : "this link"}.
              The registrations they brought in stay in your event. You can share the link with them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmRevoke(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Revoking…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default UtmPartnersSection;
