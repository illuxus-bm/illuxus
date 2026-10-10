/**
 * The "who can do what" part of sharing a tracked link with a partner:
 * the partner's email and the permissions of the share. Used inside the
 * tracked-link dialog and the Partners section of the UTM page.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSION_OPTIONS, type PartnerPermissions } from "@/lib/utm/partner-access";

const FIELD = "h-11 sm:h-9 text-base sm:text-[13px]";
const LABEL = "text-[12px] sm:text-[11px]";

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export function PartnerPermissionFields({
  value, onChange, idPrefix = "partner",
}: {
  value: PartnerPermissions;
  onChange: (next: PartnerPermissions) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] sm:text-[11px] text-muted-foreground">
        They always see who registered through this link — and nothing from any other link.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {PERMISSION_OPTIONS.map((o) => (
          <label key={o.key} htmlFor={`${idPrefix}-${o.key}`} className="flex items-start gap-2.5 py-2 sm:py-1.5 cursor-pointer min-w-0">
            <Checkbox
              id={`${idPrefix}-${o.key}`}
              checked={value[o.key]}
              onCheckedChange={(c) => onChange({ ...value, [o.key]: c === true })}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-[13px] sm:text-[12px] font-medium leading-tight">{o.label}</span>
              <span className="block text-[12px] sm:text-[11px] text-muted-foreground leading-snug">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function PartnerEmailField({
  value, onChange, id = "partner-email", optional,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  optional?: boolean;
}) {
  const invalid = value.trim() !== "" && !isEmail(value);
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id} className={LABEL}>
        Partner's email {optional && <span className="text-muted-foreground">(optional)</span>}
      </Label>
      <Input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
        placeholder="e.g. name@agency.com"
        aria-invalid={invalid}
      />
      {invalid && <p className="text-[12px] sm:text-[11px] text-destructive">Enter a valid email address.</p>}
    </div>
  );
}
