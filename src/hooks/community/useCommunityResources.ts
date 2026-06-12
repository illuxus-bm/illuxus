import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommunityResource } from "@/lib/community/types";

export function useResources(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community", "resources", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_resources" as never)
        .select("*")
        .eq("community_id", communityId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommunityResource[];
    },
  });
}

export function useUploadResource(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      title: string;
      description?: string;
      category?: CommunityResource["category"];
    }) => {
      if (!communityId) throw new Error("No community");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const ext = input.file.name.split(".").pop() ?? "bin";
      const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("community")
        .upload(path, input.file, { contentType: input.file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("community").getPublicUrl(path);
      const { error } = await supabase
        .from("community_resources" as never)
        .insert({
          community_id: communityId,
          uploaded_by: auth.user.id,
          category: input.category ?? "general",
          title: input.title,
          description: input.description ?? null,
          file_url: pub.publicUrl,
          file_name: input.file.name,
          file_size: input.file.size,
          mime_type: input.file.type,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "resources", communityId] });
    },
  });
}

export function useDeleteResource(communityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("community_resources" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", "resources", communityId] });
    },
  });
}
