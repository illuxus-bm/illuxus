import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * An explicit, unticked-by-default agreement to the Terms and Privacy Policy,
 * for any form that collects personal data.
 *
 * Consent has to be a positive act — a line of small print under the submit
 * button ("by submitting you agree…") or a pre-ticked box isn't one — so the
 * form's submit handler should refuse to proceed until `checked` is true.
 *
 * The links open in a new tab so a half-filled form isn't lost by following
 * them.
 */
export interface ConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Replaces the default "I agree to the Terms… and Privacy Policy" wording.
   *  Use `<LegalLink>` for the policy links. */
  children?: ReactNode;
  /** Shown under the box once the user has tried to submit without ticking it. */
  error?: string | null;
  className?: string;
  id?: string;
}

export function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    // A plain anchor, not a router link: it opens a new tab either way, and
    // this way the checkbox works in any form, inside a router or not.
    <a href={to} target="_blank" rel="noopener" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
      {children}
    </a>
  );
}

export function ConsentCheckbox({ checked, onCheckedChange, children, error, className, id }: ConsentCheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      <div className="flex items-start gap-2.5">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-[hsl(var(--primary))]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        />
        <label htmlFor={inputId} className="cursor-pointer text-[12px] leading-relaxed text-muted-foreground">
          {children ?? (
            <>
              I agree to the <LegalLink to="/terms">Terms of Service</LegalLink> and{" "}
              <LegalLink to="/privacy">Privacy Policy</LegalLink>.
            </>
          )}
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 pl-[26px] text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The message every form shows when it is submitted without consent. */
export const CONSENT_REQUIRED_MESSAGE = "Please tick the box to agree before continuing.";

export default ConsentCheckbox;
