import { useState } from "react";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePost } from "@/hooks/community/useCommunityFeed";
import { canPostAnnouncement, type CommunityPostType, type CommunityRole } from "@/lib/community/rbac";
import { toast } from "sonner";

export function FeedComposer({
  communityId,
  role,
}: {
  communityId: string;
  role: CommunityRole | null;
}) {
  const [type, setType] = useState<CommunityPostType>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const create = useCreatePost(communityId);

  const allowed: CommunityPostType[] = ["discussion", "question"];
  if (role && role !== "member") allowed.push("resource");
  if (canPostAnnouncement(role)) allowed.push("announcement");

  const handleSubmit = async () => {
    if (!body.trim()) {
      toast.error("Write something before posting");
      return;
    }
    try {
      await create.mutateAsync({
        type,
        title: title.trim() || undefined,
        body_md: body.trim(),
      });
      setTitle("");
      setBody("");
      setType("discussion");
      toast.success("Posted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not post");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as CommunityPostType)}>
          <SelectTrigger className="h-8 text-[12px] w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((t) => (
              <SelectItem key={t} value={t} className="text-[12px] capitalize">
                {t === "event_update" ? "Update" : t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(type === "announcement" || type === "question" || type === "resource") && (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "question" ? "Ask a question…" : "Title"}
            className="h-8 text-[13px] flex-1"
          />
        )}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share an update, ask a question, or start a discussion…"
        className="min-h-[80px] text-[13px]"
      />
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={create.isPending || !body.trim()}
          className="h-8 text-[12px] gap-1.5"
        >
          <Send className="h-3 w-3" />
          {create.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
