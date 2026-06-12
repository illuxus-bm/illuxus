import { useMemo } from "react";
import { Check } from "lucide-react";
import { scorePassword } from "@/lib/password-strength";

type Props = {
  /** The current password value. The meter is fully derived from this. */
  password: string;
  /** Hide the per-rule checklist when you only have room for the bar+label. */
  compact?: boolean;
  /** Optional id for the live region (lets a label point screen-readers at it). */
  id?: string;
};

/**
 * Live password-strength meter — renders only when the user has typed
 * something. Pure, keyboard/screen-reader friendly, no third-party deps.
 */
export default function PasswordStrengthMeter({ password, compact, id }: Props) {
  const result = useMemo(() => scorePassword(password), [password]);

  if (!password) return null;

  const segments = [0, 1, 2, 3];
  const filled = result.score; // 0..4

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="mt-2 space-y-1.5"
    >
      {/* 4-segment progress bar */}
      <div className="flex items-center gap-1" aria-hidden>
        {segments.map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < filled ? result.color.bar : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Status label + first hint */}
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className={`font-medium ${result.color.text}`}>{result.label}</span>
        {result.hint && filled < 4 && (
          <span className="text-muted-foreground">— {result.hint}</span>
        )}
      </div>

      {/* Per-rule checklist */}
      {!compact && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {result.rules.map((r) => (
            <li
              key={r.key}
              className={`flex items-center gap-1.5 ${
                r.met ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center h-3 w-3 rounded-full shrink-0 ${
                  r.met
                    ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                    : "bg-muted"
                }`}
                aria-hidden
              >
                {r.met ? (
                  <Check className="h-2 w-2" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                )}
              </span>
              <span className="truncate">{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
