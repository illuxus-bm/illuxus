import { useState, useEffect } from "react";
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

/**
 * GDPR-compliant cookie consent banner.
 * Renders at the bottom-right on desktop, full-width on mobile.
 * Animates in with a slide-up; respects prefers-reduced-motion.
 * Stores the decision under `illuxus:cookie-consent` in localStorage.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [marketingOn, setMarketingOn] = useState(false);

  // Only show after mount so SSR / hydration is stable
  useEffect(() => {
    const decision = readDecision();
    if (!decision) {
      setVisible(true);
    }
  }, []);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const slideVariants = {
    hidden: { y: prefersReducedMotion ? 0 : 24, opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: prefersReducedMotion ? 0 : 16, opacity: 0 },
  };

  const handleAccept = () => {
    const d: ConsentDecision = {
      consent: "accepted",
      analytics: analyticsOn,
      marketing: marketingOn,
      timestamp: Date.now(),
    };
    saveDecision(d);
    logger.info("cookie-consent accepted", { analytics: analyticsOn, marketing: marketingOn });
    setVisible(false);
  };

  const handleDecline = () => {
    const d: ConsentDecision = {
      consent: "declined",
      analytics: false,
      marketing: false,
      timestamp: Date.now(),
    };
    saveDecision(d);
    logger.info("cookie-consent declined");
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
          aria-label="Cookie consent"
          className={[
            "fixed z-50 bottom-4 right-4 left-4",
            "sm:left-auto sm:w-[480px]",
            "bg-card border border-border rounded-2xl shadow-xl",
            "p-4 sm:p-5",
            "text-sm",
          ].join(" ")}
        >
          {/* Header row */}
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Cookie className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">
                We use cookies to improve your experience and collect analytics.{" "}
                <Link to="/privacy" className="underline underline-offset-2 text-indigo-500 hover:text-indigo-400">
                  Learn more
                </Link>
              </p>
            </div>
          </div>

          {/* Manage preferences toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Manage preferences
          </button>

          {/* Expanded preferences */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                key="prefs"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mb-4 border border-border rounded-xl p-3 bg-muted/40">
                  {/* Essential */}
                  <CookieCategory
                    icon={<Shield className="h-3.5 w-3.5 text-green-500" />}
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

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
              onClick={handleAccept}
            >
              Accept all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-xs h-8"
              onClick={handleDecline}
            >
              Decline
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
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange?.(!enabled)}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              enabled ? "bg-indigo-600" : "bg-muted-foreground/30",
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
