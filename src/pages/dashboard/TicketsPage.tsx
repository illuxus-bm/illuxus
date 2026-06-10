import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOrg } from "@/contexts/OrgContext";
import { motion } from "framer-motion";
import { Ticket, DollarSign, TrendingUp, BarChart3 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/currency";

type Event = Tables<"events">;

const TicketsPage = () => {
  const { org } = useOrg();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org?.id) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("org_id", org.id)
        .order("tickets_sold", { ascending: false });
      if (data) setEvents(data);
      setLoading(false);
    };
    fetch();
  }, [org?.id]);

  const totalSold = events.reduce((s, e) => s + (e.tickets_sold || 0), 0);
  const totalCapacity = events.reduce((s, e) => s + (e.capacity || 0), 0);
  const totalRevenue = events.reduce((s, e) => s + (e.tickets_sold || 0) * Number(e.price || 0), 0);
  const avgPrice = events.length ? events.reduce((s, e) => s + Number(e.price || 0), 0) / events.length : 0;

  const stats = [
    { icon: Ticket, label: "Total Tickets Sold", value: totalSold.toLocaleString(), color: "text-primary" },
    { icon: BarChart3, label: "Total Capacity", value: totalCapacity.toLocaleString(), color: "text-accent" },
    { icon: DollarSign, label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "text-green-500" },
    { icon: TrendingUp, label: "Avg. Ticket Price", value: `$${avgPrice.toFixed(2)}`, color: "text-primary" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1200px]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tickets</h1>
          <p className="text-[13px] text-muted-foreground">Track ticket sales across all events</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </motion.div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden card-shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Event</th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Price</th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Sold</th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Capacity</th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Fill Rate</th>
                    <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const fillRate = event.capacity ? Math.round(((event.tickets_sold || 0) / event.capacity) * 100) : 0;
                    const revenue = (event.tickets_sold || 0) * Number(event.price || 0);
                    return (
                      <tr key={event.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-4 font-medium">{event.title}</td>
                        <td className="p-4 text-sm">{formatMoney(Number(event.price || 0), event.currency || undefined)}</td>
                        <td className="p-4 text-sm">{event.tickets_sold || 0}</td>
                        <td className="p-4 text-sm">{event.capacity || "∞"}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(fillRate, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{fillRate}%</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-medium">${revenue.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TicketsPage;
