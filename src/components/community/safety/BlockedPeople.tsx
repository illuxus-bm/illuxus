import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBlockedPeople, useUnblockUser } from "@/hooks/community/useBlocks";
import { friendlyError } from "@/lib/friendly-error";

const nameOf = (p: { display_name: string | null; first_name: string | null; last_name: string | null; username: string | null } | null) =>
  p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.username || "Someone";

/** Settings → Account: the people you've blocked, with Unblock. */
export function BlockedPeople() {
  const { data: people = [], isLoading } = useBlockedPeople();
  const unblock = useUnblockUser();

  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-[13px] font-semibold">Blocked people</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        You don't see posts, comments or messages from people you've blocked, in any community. They aren't told.
        Block someone from the ⋯ menu on anything they post.
      </p>
      {isLoading ? null : people.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">You haven't blocked anyone.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {people.map(({ userId, profile }) => {
            const name = nameOf(profile);
            return (
              <li key={userId} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px]"
                  disabled={unblock.isPending}
                  onClick={async () => {
                    try {
                      await unblock.mutateAsync(userId);
                      toast.success(`${name} is unblocked`);
                    } catch (err) {
                      toast.error(`Couldn't unblock ${name}`, { description: friendlyError(err) });
                    }
                  }}
                >
                  Unblock
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
