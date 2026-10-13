import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Cookie, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";

const STORAGE_KEY = "illuxus:cookie-consent";

type ConsentDecision = {
  consent: "accepted" | "declined";
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
};

function readDecision(): ConsentDecision | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentDecision>;
    if (parsed.consent === "accepted" || parsed.consent === "declined") {
      return parsed as ConsentDecision;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveDecision(d: ConsentDecision) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    // Notify other tabs
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(d) }));
  } catch {
    // ignore storage errors (private browsing, quota)
  }
}

/** Fired to reopen the banner so a choice can be reviewed or changed. */
const OPEN_EVENT = "illuxus:open-cookie-settings";

/** Reopens the cookie banner — wired to the "Cookie settings" footer link. */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Cookie consent banner.
 *
 * Non-essential cookies are OFF until the visitor turns them on: nothing is
 * pre-selected, rejecting is as prominent and as quick as accepting, and
 * "Accept all" means all. The choice can be changed at any time from the
 * "Cookie settings" link in the footer, which reopens this banner showing
 * what was chosen.
 *
 * Renders bottom-right on desktop, full-width on mobile; respects
 * prefers-reduced-motion. The decision is stored under
 * `illuxus:cookie-consent` in localStorage and read by `useCookieConsent`.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [marketingOn, setMarketingOn] = useState(false);
  // Whether a choice already exists — only then may the banner be dismissed
  // without making one.
  const [decided, setDecided] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Only show after mount so SSR / hydration is stable
  useEffect(() => {
    const decision = readDecision();
    if (!decision) setVisible(true);
    else setDecided(true);
  }, []);

  // Reopened from the footer: show the stored choice, expanded, and move
  // keyboard focus to the banner since the user asked for it.
  useEffect(() => {
    const reopen = () => {
      const decision = readDecision();
      setAnalyticsOn(decision?.analytics ?? false);
      setMarketingOn(decision?.marketing ?? false);
      setDecided(decision !== null);
      setExpanded(true);
      setVisible(true);
      requestAnimationFrame(() => headingRef.current?.focus());
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const slideVariants = {
    hidden: { y: prefersReducedMotion ? 0 : 24, opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: prefersReducedMotion ? 0 : 16, opacity: 0 },
  };

  const decide = (analytics: boolean, marketing: boolean) => {
    saveDecision({
      consent: analytics || marketing ? "accepted" : "declined",
      analytics,
      marketing,
      timestamp: Date.now(),
    });
    logger.info("cookie-consent saved", { analytics, marketing });
    setAnalyticsOn(analytics);
    setMarketingOn(marketing);
    setDecided(true);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="cookie-banner"
          variants={slideVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-banner-title"
          aria-describedby="cookie-banner-text"
          onKeyDown={(event) => {
            // Escape closes a reopened banner; a first-time banner needs an answer.
            if (event.key === "Escape" && decided) setVisible(false);
          }}
          className={[
            "fixed z-50 bottom-4 right-4 left-4",
            "sm:left-auto sm:w-[480px]",
            "bg-card border border-border rounded-2xl shadow-pop",
            "p-4 sm:p-5",
            "text-sm",
          ].join(" ")}
        >
          {/* Header row */}
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-secondary flex items-center justify-center">
              <Cookie className="h-4 w-4 text-foreground" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="cookie-banner-title" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-foreground outline-none">
                Cookies on this site
              </h2>
              <p id="cookie-banner-text" className="mt-1 text-[13px] text-muted-foreground leading-snug">
                We use essential cookies to keep you signed in. With your permission we also use analytics and marketing
                cookies. You can change this at any time.{" "}
                <Link to="/cookies" className="underline underline-offset-2 text-foreground hover:opacity-70">
                  Cookie policy
                </Link>
              </p>
            </div>
          </div>

          {/* Manage preferences toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls="cookie-banner-preferences"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            Choose which cookies
          </button>

          {/* Expanded preferences */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                key="prefs"
                id="cookie-banner-preferences"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mb-4 border border-border rounded-xl p-3 bg-muted/40">
                  {/* Essential */}
                  <CookieCategory
                    icon={<Shield className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />}
                    label="Essential cookies"
                    description="Required for authentication and security. Cannot be disabled."
                    enabled={true}
                    locked
                  />
                  {/* Analytics */}
                  <CookieCategory
                    label="Analytics cookies"
                    description="Help us understand how visitors use the platform."
                    enabled={analyticsOn}
                    onChange={setAnalyticsOn}
                  />
                  {/* Marketing */}
                  <CookieCategory
                    label="Marketing cookies"
                    description="Used to show relevant ads and promotions."
                    enabled={marketingOn}
                    onChange={setMarketingOn}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons — rejecting is as easy as accepting. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="flex-1 text-xs h-8 rounded-full" onClick={() => decide(false, false)}>
              Reject non-essential
            </Button>
            {expanded && (
              <Button type="button" size="sm" variant="outline" className="flex-1 text-xs h-8 rounded-full" onClick={() => decide(analyticsOn, marketingOn)}>
                Save my choices
              </Button>
            )}
            <Button type="button" size="sm" className="flex-1 text-xs h-8 rounded-full" onClick={() => decide(true, true)}>
              Accept all
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Cookie category row                                                   */
/* ------------------------------------------------------------------ */

interface CategoryProps {
  icon?: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onChange?: (val: boolean) => void;
}

function CookieCategory({ icon, label, description, enabled, locked, onChange }: CategoryProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground leading-none mb-0.5">{label}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
        </div>
      </div>
      <div className="shrink-0 mt-0.5">
        {locked ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600 bg-green-500/10 rounded px-1.5 py-0.5">
            Always on
          </span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            onClick={() => onChange?.(!enabled)}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              enabled ? "bg-foreground" : "bg-muted-foreground/30",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-4" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        )}
      </div>
    </div>
  );
}
