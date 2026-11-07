import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseRpc } from "@/lib/observability";
import { useMyBans, type MyBan } from "./useMyBans";

/**
 * Unban requests (section 080, B-3). A ban is lifted only by
 * approving the banned person's request: platform bans by a platform admin,
 * community bans by that community's organisers. The database enforces all of
 * this; these components are the screens for it.
 */

export interface UnbanRequestRow {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  scope: "platform" | "community";
  community_id: string | null;
  community_name: string | null;
  message: string;
  created_at: string;
  ban_reason: string | null;
  banned_at: string | null;
}

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/** Lets a banned person ask to be let back in, or shows where that stands. */
export function UnbanRequestForm({ ban }: { ban: MyBan }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseRpc("request_unban", {
        _scope: ban.scope,
        _community_id: ban.community_id,
        _message: message.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent. You'll see the decision here.");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["my-bans"] });
    },
    onError: (e) => toast.error(errorText(e, "Could not send your request")),
  });

  if (ban.request_status === "pending") {
    return (
      <p className="text-[13px] text-muted-foreground">
        Your request was sent on {new Date(ban.request_created_at!).toLocaleDateString()} and is waiting for a decision.
      </p>
    );
  }

  const length = message.trim().length;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (length >= MESSAGE_MIN && !send.isPending) send.mutate();
      }}
    >
      {ban.request_status === "rejected" && (
        <p className="text-[13px] text-muted-foreground">
          Your last request was declined{ban.review_note ? `: “${ban.review_note}”` : "."} You can ask again.
        </p>
      )}
      <label htmlFor={`unban-${ban.community_id ?? "platform"}`} className="text-[13px] font-medium">
        Ask to be let back in
      </label>
      <Textarea
        id={`unban-${ban.community_id ?? "platform"}`}
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
        placeholder="Explain why the ban should be lifted."
        rows={4}
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted-foreground">
          {length < MESSAGE_MIN ? `At least ${MESSAGE_MIN} characters` : `${length}/${MESSAGE_MAX}`}
        </span>
        <Button type="submit" size="sm" disabled={length < MESSAGE_MIN || send.isPending}>
          {send.isPending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Covers the app for a platform-banned account, with the reason and a way to
 * ask for the ban to be lifted. Renders nothing for everyone else.
 */
export function PlatformBanNotice() {
  const { user, signOut } = useAuth();
  const { data } = useMyBans();
  const ban = data?.find((b) => b.scope === "platform");
  if (!user || !ban) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="platform-ban-title"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-destructive" aria-hidden="true" />
          <h2 id="platform-ban-title" className="text-lg font-semibold">Your account is suspended</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {ban.reason ? `Reason: ${ban.reason}` : "A platform admin suspended this account."}
        </p>
        <UnbanRequestForm ban={ban} />
        <Button variant="outline" size="sm" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/**
 * Pending requests for a reviewer to decide. Without `communityId`: platform
 * requests (platform admins). With it: that community's requests (its
 * organisers).
 */
export function UnbanRequestsPanel({ communityId }: { communityId?: string }) {
  const qc = useQueryClient();
  const key = ["unban-requests", communityId ?? "platform"];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabaseRpc<UnbanRequestRow[]>("unban_requests_to_review", {
        _community_id: communityId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const note = approve ? null : window.prompt("Optional note for the person (why it was declined):");
      const { error } = await supabaseRpc("review_unban_request", {
        _request_id: id,
        _approve: approve,
        _note: note,
      });
      if (error) throw error;
      return approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Ban lifted" : "Request declined");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
      qc.invalidateQueries({ queryKey: ["community", "members"] });
    },
    onError: (e) => toast.error(errorText(e, "Could not save the decision")),
  });

  if (error || (!isLoading && !data?.length)) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="unban-requests-title">
      <h2 id="unban-requests-title" className="text-sm font-semibold">
        Unban requests {data?.length ? `(${data.length})` : ""}
      </h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        A ban is lifted only by approving the person's request.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.display_name}</p>
              {r.ban_reason && <p className="text-[12px] text-muted-foreground">Banned for: {r.ban_reason}</p>}
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{r.message}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, approve: false })}
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Decline
              </Button>
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, approve: true })}
              >
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Lift ban
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
