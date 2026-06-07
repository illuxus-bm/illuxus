import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Heart } from "lucide-react";

interface FollowedOrg {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

/** Lu.ma-style attendee profile + followed organizations. */
export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [followed, setFollowed] = useState<FollowedOrg[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username, headline, bio, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: follows } = await supabase
        .from("org_followers")
        .select("org_id")
        .eq("user_id", user.id);
      if (cancel) return;
      let orgs: FollowedOrg[] = [];
      if (follows && follows.length > 0) {
        const ids = follows.map((f) => f.org_id);
        const { data: orgRows } = await supabase
          .from("organizations")
          .select("id, name, slug, logo_url")
          .in("id", ids);
        orgs = (orgRows ?? []) as FollowedOrg[];
      }
      const p = profile as { display_name?: string; username?: string; headline?: string; bio?: string; avatar_url?: string } | null;
      setDisplayName(p?.display_name ?? "");
      setUsername(p?.username ?? "");
      setHeadline(p?.headline ?? "");
      setBio(p?.bio ?? "");
      setAvatarUrl(p?.avatar_url ?? "");
      setFollowed(orgs);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        username: username ? username.trim().toLowerCase() : null,
        headline: headline || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
      })
      .eq("user_id", user.id);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
    setSaving(false);
  };

  const initials = (displayName || user?.email || "A").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">Your profile</h1>

        {loading ? (
          <Skeleton className="h-72 rounded-2xl" />
        ) : (
          <form onSubmit={save} className="bg-card border border-border rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-semibold">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Label className="text-[12px]">Avatar URL</Label>
                <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="h-9 mt-1 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-9 mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-[12px]">Username</Label>
                <div className="flex items-center mt-1">
                  <span className="px-2 h-9 inline-flex items-center text-[12px] text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">@</span>
                  <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, ""))} className="h-9 text-sm rounded-l-none" placeholder="yourname" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Headline</Label>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Designer at …" className="h-9 mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[12px]">Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="h-9 text-[13px]">{saving ? "Saving…" : "Save profile"}</Button>
            </div>
          </form>
        )}

        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Following</h2>
            <span className="text-[12px] text-muted-foreground">· {followed.length}</span>
          </div>
          {followed.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">You're not following any organizations yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {followed.map((o) => (
                <li key={o.id}>
                  <Link to={`/${o.slug}`} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-foreground/20 transition-colors">
                    {o.logo_url ? (
                      <img src={o.logo_url} alt={o.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-semibold">{o.name[0]}</div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{o.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">/{o.slug}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}