import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { isNativeApp } from "@/lib/native/platform";
import { inAppPath, setAppNavigator } from "@/lib/native/boot";

/**
 * The app's side of the native shell (iOS / Android). Mount once inside the
 * router; renders nothing, and does nothing in a browser.
 *
 *  - Android's back button closes an open dialog or sheet first, then goes
 *    back a page, and leaves the app from the first page.
 *  - Links that open the app (illuxus.com App Links / Universal Links, or
 *    `illuxus://`) land on their page. A sign-in link's session, which
 *    Supabase puts in the URL fragment, is picked up on the way.
 *  - The status bar's text follows the light / dark theme.
 */
export function NativeBridge() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const native = isNativeApp();

  useEffect(() => {
    if (!native) return;
    setAppNavigator((to) => navigate(to));
    return () => setAppNavigator(null);
  }, [native, navigate]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    void import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;

      handles.push(await App.addListener("backButton", ({ canGoBack }) => {
        // Radix dialogs, sheets and menus close on Escape.
        const open = document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [data-vaul-drawer][data-state="open"]');
        if (open) {
          (document.activeElement ?? document.body).dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
          );
          return;
        }
        if (canGoBack && window.history.length > 1) window.history.back();
        else void App.exitApp();
      }));

      handles.push(await App.addListener("appUrlOpen", async ({ url }) => {
        const path = inAppPath(url);
        if (path === null) return;
        const target = new URL(path, window.location.origin);
        const params = new URLSearchParams(target.hash.replace(/^#/, ""));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) logger.warn("native.deep_link_session_failed", { error_message: error.message });
          // Keep the link's type only: ResetPasswordPage reads `type=recovery`.
          const type = params.get("type");
          target.hash = type ? `type=${type}` : "";
        }
        navigate(`${target.pathname}${target.search}${target.hash}`);
      }));
    });

    return () => {
      cancelled = true;
      for (const h of handles) void h.remove();
    };
  }, [native, navigate]);

  useEffect(() => {
    if (!native) return;
    void import("@capacitor/core").then(({ SystemBars, SystemBarsStyle }) =>
      // "Dark" is light text, for a dark page.
      SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }),
    ).catch(() => { /* older shell */ });
  }, [native, theme]);

  return null;
}
