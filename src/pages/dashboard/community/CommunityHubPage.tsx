import { useState } from "react";
import { Link } from "react-router-dom";
import { CommunityShell } from "@/components/community/layout/CommunityShell";
import { useMyCommunities, usePublicCommunities, useChildCommunities } from "@/hooks/community/useCommunity";
import { Users, Monitor, Bot, Rocket, Trophy, Shield, LineChart, GraduationCap, Palette, Megaphone, HeartPulse, Leaf, Globe, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const categoryMeta: Record<string, { icon: React.ElementType, gradient: string, color: string }> = {
  "tech": { icon: Monitor, gradient: "from-blue-500/20 to-cyan-500/5", color: "text-blue-500" },
  "ai": { icon: Bot, gradient: "from-violet-500/20 to-purple-500/5", color: "text-violet-500" },
  "startup": { icon: Rocket, gradient: "from-orange-500/20 to-amber-500/5", color: "text-orange-500" },
  "hackathon": { icon: Trophy, gradient: "from-yellow-500/20 to-yellow-600/5", color: "text-yellow-500" },
  "cybersecurity": { icon: Shield, gradient: "from-slate-500/20 to-slate-400/5", color: "text-slate-500" },
  "finance": { icon: LineChart, gradient: "from-emerald-500/20 to-green-500/5", color: "text-emerald-500" },
  "education": { icon: GraduationCap, gradient: "from-indigo-500/20 to-blue-500/5", color: "text-indigo-500" },
  "design": { icon: Palette, gradient: "from-pink-500/20 to-rose-500/5", color: "text-pink-500" },
  "marketing": { icon: Megaphone, gradient: "from-red-500/20 to-orange-500/5", color: "text-red-500" },
  "health": { icon: HeartPulse, gradient: "from-rose-500/20 to-pink-500/5", color: "text-rose-500" },
  "sustainability": { icon: Leaf, gradient: "from-green-500/20 to-emerald-500/5", color: "text-green-500" },
  "other": { icon: Globe, gradient: "from-zinc-500/20 to-zinc-400/5", color: "text-zinc-500" }
};

function getCategoryMeta(name: string) {
  const normalized = name.toLowerCase().replace(" community", "").replace(" hub", "").trim();
  return categoryMeta[normalized] || categoryMeta["other"];
}

export default function CommunityHubPage() {
  const mine = useMyCommunities();
  const explore = usePublicCommunities(); // This fetches 'parent' kind (the category hubs)
  
  const [selectedHub, setSelectedHub] = useState<{ id: string, name: string } | null>(null);
  const children = useChildCommunities(selectedHub?.id ?? null);
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();

  const seedHubs = async () => {
    setSeeding(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not logged in");
      
      const hubsToCreate = [
        { slug: 'hub-tech', name: 'Tech', kind: 'parent', category: 'tech', visibility: 'public', created_by: user.user.id },
        { slug: 'hub-ai', name: 'AI', kind: 'parent', category: 'ai', visibility: 'public', created_by: user.user.id },
        { slug: 'hub-startup', name: 'Startup', kind: 'parent', category: 'startup', visibility: 'public', created_by: user.user.id },
        { slug: 'hub-hackathon', name: 'Hackathon', kind: 'parent', category: 'hackathon', visibility: 'public', created_by: user.user.id },
        { slug: 'hub-health', name: 'Health', kind: 'parent', category: 'health', visibility: 'public', created_by: user.user.id }
      ];
      
      const { error } = await supabase.from('communities').insert(hubsToCreate);
      if (error) throw error;
      
      toast({ title: "Hubs initialized!" });
      explore.refetch();
    } catch (err: any) {
      toast({ title: "Failed to initialize hubs", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <CommunityShell>
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Discover Communities</h1>
              <p className="text-xs text-muted-foreground">Explore industry hubs and join event discussions.</p>
            </div>
          </div>

          {/* Hubs row */}
          <div className="mt-6">
            <h2 className="text-[13px] font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Industry Hubs</h2>
            {explore.isLoading ? (
              <div className="flex gap-3 overflow-hidden">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-24 w-48 shrink-0 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : !explore.data?.length ? (
                <div className="border border-dashed border-border rounded-xl p-8 text-center bg-muted/10 space-y-4 max-w-full">
                  <p className="text-[13px] text-muted-foreground">No hubs available yet in your database.</p>
                  <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={seedHubs} disabled={seeding}>
                    {seeding ? "Initializing..." : "Initialize Default Hubs"}
                  </Button>
                  <div className="space-y-4 rounded-xl border border-border bg-background p-4 text-left w-full">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Create Event Community</p>
                          <p className="text-[12px] text-muted-foreground">Give attendees a space to discuss this event.</p>
                        </div>
                        <Switch checked={createCommunity} onCheckedChange={setCreateCommunity} />
                      </div>
                      {createCommunity && (
                        <div className="pt-2 border-t border-border">
                          <Label className="text-[12px]">Community Category</Label>
                          <Select value={communityCategory} onValueChange={setCommunityCategory}>
                            <SelectTrigger className="h-9 mt-1 text-[13px] w-full">
                              <SelectValue placeholder="Select a category hub" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tech">Tech</SelectItem>
                              <SelectItem value="ai">AI</SelectItem>
                              <SelectItem value="startup">Startup</SelectItem>
                              <SelectItem value="hackathon">Hackathon</SelectItem>
                              <SelectItem value="cybersecurity">Cybersecurity</SelectItem>
                              <SelectItem value="finance">Finance</SelectItem>
                              <SelectItem value="education">Education</SelectItem>
                              <SelectItem value="design">Design</SelectItem>
                              <SelectItem value="marketing">Marketing</SelectItem>
                              <SelectItem value="health">Health</SelectItem>
                              <SelectItem value="sustainability">Sustainability</SelectItem>
                              <SelectItem value="other">Other / General</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground mt-1">Your event community will be linked to this industry hub.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-5 pt-1 px-1 -mx-1 snap-x no-scrollbar">
                {explore.data?.map(hub => {
                  const meta = getCategoryMeta(hub.name);
                  const Icon = meta.icon;
                  const isSelected = selectedHub?.id === hub.id;
                  
                  return (
                    <button
                      key={hub.id}
                      onClick={() => setSelectedHub(isSelected ? null : { id: hub.id, name: hub.name })}
                      className={cn(
                        "shrink-0 w-48 rounded-xl border p-4 flex flex-col items-start gap-3 transition-all snap-start text-left group relative",
                        isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-md scale-[1.02]" 
                          : `border-border hover:border-foreground/20 bg-gradient-to-br ${meta.gradient} hover:shadow-sm`
                      )}
                    >
                      <div className={cn("p-2 rounded-lg bg-background/80 shadow-sm backdrop-blur-sm z-10", meta.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="z-10 w-full min-w-0">
                        <div className="font-semibold text-[14px] truncate w-full">{hub.name}</div>
                      </div>
                      {/* Decorative background icon */}
                      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                        <Icon className={cn("absolute -bottom-4 -right-4 h-24 w-24 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110", meta.color)} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drill down or My Communities */}
        <div className="pt-2 border-t border-border">
          {selectedHub ? (
             <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                 <div>
                   <h2 className="text-[16px] font-semibold flex items-center gap-2">
                     Events in {selectedHub.name}
                   </h2>
                   <p className="text-[12px] text-muted-foreground mt-0.5">Explore event communities under this hub.</p>
                 </div>
                 <button 
                   onClick={() => setSelectedHub(null)}
                   className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg transition-colors border border-border"
                 >
                   <ArrowLeft className="h-3 w-3" /> Back to My Communities
                 </button>
               </div>
               
               {children.isLoading ? (
                 <p className="text-sm text-muted-foreground py-8 text-center">Loading event communities…</p>
               ) : !children.data?.length ? (
                 <div className="border border-dashed border-border rounded-xl p-10 text-center bg-muted/10">
                   <p className="text-[13px] text-muted-foreground">No public event communities under {selectedHub.name} yet.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                   {children.data.map((c) => (
                     <CommunityTile key={c.id} community={c} />
                   ))}
                 </div>
               )}
             </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-[15px] font-semibold mb-1">My Communities</h2>
              <p className="text-[12px] text-muted-foreground mb-4">Event communities you are participating in.</p>
              
              {mine.isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : !mine.data?.length ? (
                <div className="border border-dashed border-border rounded-xl p-10 text-center bg-muted/10">
                  <p className="text-[13px] text-muted-foreground">You're not in any community yet.</p>
                  <p className="text-[12px] text-muted-foreground mt-1">Select an industry hub above to explore events and join.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {mine.data.map((m) => (
                    <CommunityTile key={m.community.id} community={m.community} myRole={m.role} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </CommunityShell>
  );
}

function CommunityTile({
  community,
  myRole,
}: {
  community: { id: string; slug: string; name: string; description: string | null; member_count: number; post_count: number; kind: string };
  myRole?: string;
}) {
  return (
    <Link
      to={`/community/${community.slug}/feed`}
      className="border border-border rounded-xl bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col gap-2 group"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[14px] font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {community.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium truncate group-hover:text-primary transition-colors">{community.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{community.kind}{myRole ? ` · ${myRole}` : ""}</p>
        </div>
      </div>
      {community.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{community.description}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto pt-3 border-t border-border/50">
        <span><strong className="text-foreground tabular-nums">{community.member_count}</strong> members</span>
        <span><strong className="text-foreground tabular-nums">{community.post_count}</strong> posts</span>
      </div>
    </Link>
  );
}
