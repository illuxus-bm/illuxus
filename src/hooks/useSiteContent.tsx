import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SITE_CONTENT,
  SiteContentMap,
  SiteSection,
} from "@/lib/site-content";

interface SiteContentContextType {
  content: SiteContentMap;
  loading: boolean;
  /** True once we have content from DB (or confirmed cache hit from a prior DB load). */
  hydrated: boolean;
  refresh: () => Promise<void>;
}

const SiteContentContext = createContext<SiteContentContextType>({
  content: DEFAULT_SITE_CONTENT,
  loading: true,
  hydrated: false,
  refresh: async () => {},
});

export const useSiteContent = () => useContext(SiteContentContext);

const CACHE_KEY = "site_content_cache_v2";

const readCache = (): SiteContentMap | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteContentMap>;
    // Merge cached values on top of defaults so newly added sections still resolve.
    const merged: SiteContentMap = { ...DEFAULT_SITE_CONTENT };
    for (const key of Object.keys(parsed) as SiteSection[]) {
      if (key in merged) {
        (merged as any)[key] = {
          ...(DEFAULT_SITE_CONTENT as any)[key],
          ...(parsed as any)[key],
        };
      }
    }
    return merged;
  } catch {
    return null;
  }
};

const writeCache = (content: SiteContentMap) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(content));
  } catch {
    // ignore quota / privacy-mode failures
  }
};

export const SiteContentProvider = ({ children }: { children: ReactNode }) => {
  // Hydrate synchronously from localStorage so the first paint already shows the
  // most recently saved branding (logos, copy, favicon) instead of the hardcoded
  // legacy defaults. This eliminates the "old content flashes, then swaps" jump.
  const cached = typeof window !== "undefined" ? readCache() : null;
  const [content, setContent] = useState<SiteContentMap>(cached ?? DEFAULT_SITE_CONTENT);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState<boolean>(!!cached);

  const load = useCallback(async () => {
    const { data } = await supabase.from("site_content").select("section, content");
    if (data && data.length > 0) {
      const merged: SiteContentMap = { ...DEFAULT_SITE_CONTENT };
      for (const row of data) {
        const section = row.section as SiteSection;
        if (section in merged) {
          // Merge so missing keys fall back to defaults
          (merged as any)[section] = {
            ...(DEFAULT_SITE_CONTENT as any)[section],
            ...(row.content as any),
          };
        }
      }
      setContent(merged);
      writeCache(merged);
    }
    setLoading(false);
    setHydrated(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SiteContentContext.Provider value={{ content, loading, hydrated, refresh: load }}>
      {children}
    </SiteContentContext.Provider>
  );
};