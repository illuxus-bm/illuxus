import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import { Users, Search, UserCheck, UserX, Loader2, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AttendeeRow {
  id: string;
  name: string;
  email: string;
  status: string;
  approval_status: string;
  ticket_type: string;
  checked_in: boolean;
  created_at: string;
  event_title: string;
  event_id: string;
}

const AttendeesPage = () => {
  const { org } = useOrg();
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!org) return;

    const fetchAttendees = async () => {
      setLoading(true);
      // Scoped to only events that belong to this organization — no platform-wide leak
      const { data: orgEvents } = await supabase
        .from("events")
        .select("id, title")
        .eq("org_id", org.id);

      if (!orgEvents || orgEvents.length === 0) {
        setAttendees([]);
        setLoading(false);
        return;
      }

      const eventIds = orgEvents.map((e) => e.id);
      const eventTitleMap = new Map(orgEvents.map((e) => [e.id, e.title]));

      const { data: regs, error } = await supabase
        .from("registrations")
        .select(
          "id, name, email, status, approval_status, ticket_type, checked_in, created_at, event_id",
        )
        .in("event_id", eventIds)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch attendees:", error.message);
        setLoading(false);
        return;
      }

      setAttendees(
        (regs || []).map((r) => ({
          ...r,
          event_title: eventTitleMap.get(r.event_id) || "Unknown event",
        })),
      );
      setLoading(false);
    };

    fetchAttendees();
  }, [org]);

  const filtered = attendees.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.event_title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const stats = [
    { icon: Users, label: "Total Registrants", value: attendees.length },
    {
      icon: UserCheck,
      label: "Checked In",
      value: attendees.filter((a) => a.checked_in).length,
    },
    {
      icon: UserX,
      label: "Not Checked In",
      value: attendees.filter((a) => !a.checked_in).length,
    },
  ];

  const approvalBadge = (status: string) => {
    if (status === "approved")
      return "bg-green-500/10 text-green-600 border-green-500/20";
    if (status === "pending")
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    if (status === "rejected")
      return "bg-destructive/10 text-destructive border-destructive/20";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1200px]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Attendees</h1>
          <p className="text-[13px] text-muted-foreground">
            View and manage registrants across all your events
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-5 card-shadow"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or event…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading attendees…</span>
          </div>
        ) : !org ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No organization found</h3>
            <p className="text-sm text-muted-foreground">
              Complete onboarding to see your attendees here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No matching attendees" : "No attendees yet"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Try a different search term."
                : "Registrants from your events will appear here."}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden card-shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Attendee
                    </th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Event
                    </th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Ticket
                    </th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Checked In
                    </th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">
                      Registered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((attendee) => (
                    <tr
                      key={attendee.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                            {(attendee.name || "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {attendee.name}
                            </div>
                            <div className="text-[12px] text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              {attendee.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground max-w-[160px] truncate">
                        {attendee.event_title}
                      </td>
                      <td className="p-4">
                        <span className="text-[12px] text-muted-foreground capitalize">
                          {attendee.ticket_type || "standard"}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-medium capitalize ${approvalBadge(attendee.approval_status)}`}
                        >
                          {attendee.approval_status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[12px] font-medium ${attendee.checked_in ? "text-green-600" : "text-muted-foreground"}`}
                        >
                          {attendee.checked_in ? "✓ Yes" : "— No"}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(attendee.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border bg-muted/20">
              <p className="text-[12px] text-muted-foreground">
                Showing {filtered.length} of {attendees.length} registrant
                {attendees.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AttendeesPage;
