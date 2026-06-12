import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useAppNotifications, useMarkNotificationsRead } from "@/hooks/community/useCommunityExtras";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useAppNotifications();
  const mark = useMarkNotificationsRead();

  const unread = useMemo(() => (data ?? []).filter((n) => !n.read).length, [data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 text-[9px] font-bold rounded-full bg-destructive text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1"
              onClick={() => mark.mutate(undefined)}
            >
              <Check className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground text-center py-6">Loading…</p>
          ) : !data?.length ? (
            <p className="text-[12px] text-muted-foreground text-center py-6">You're all caught up.</p>
          ) : (
            <ul>
              {data.map((n) => {
                const inner = (
                  <div className={`px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors ${
                    !n.read ? "bg-primary/[0.04]" : ""
                  }`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium leading-snug">{n.title}</p>
                        {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => { mark.mutate([n.id]); setOpen(false); }}>{inner}</Link>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
