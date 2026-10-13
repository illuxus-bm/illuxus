import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPLOYEE_COUNT_OPTIONS, INDUSTRY_OPTIONS, TITLE_OPTIONS } from "@/lib/phone-country";
import { CountryCodePicker } from "@/components/people/CountryCodePicker";
import { z } from "zod";

export type PersonFields = {
  title: string;
  first_name: string;
  last_name: string;
  designation: string;
  company: string;
  email: string;
  mobile_country_code: string;
  mobile_number: string;
  linkedin_url: string;
  company_website: string;
  company_employee_count: string;
  industry: string;
};

export const emptyPersonFields = (): PersonFields => ({
  title: "",
  first_name: "",
  last_name: "",
  designation: "",
  company: "",
  email: "",
  mobile_country_code: "",
  mobile_number: "",
  linkedin_url: "",
  company_website: "",
  company_employee_count: "",
  industry: "",
});

export const personFieldsSchema = z.object({
  // Title is optional and never displayed on public surfaces.
  title: z.string().optional().or(z.literal("")),
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  designation: z.string().trim().min(1, "Designation is required").max(120),
  company: z.string().trim().min(1, "Company is required").max(160),
  email: z.string().trim().email("Valid email is required").max(255),
  mobile_country_code: z.string().regex(/^\+\d{1,4}$/i, "Country code required"),
  mobile_number: z.string().trim().min(1, "Mobile number is required").regex(/^\d{6,15}$/, "Enter 6–15 digits"),
  linkedin_url: z.string().trim().url("Invalid URL").max(255).optional().or(z.literal("")),
  company_website: z.string().trim().url("Invalid URL").max(255).optional().or(z.literal("")),
  company_employee_count: z.string().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
});

export function validatePersonFields(v: PersonFields) {
  const r = personFieldsSchema.safeParse(v);
  if (r.success) return { ok: true as const, data: r.data };
  return { ok: false as const, error: r.error.errors[0]?.message || "Please complete required fields" };
}

/** Concatenates parts into a display name for storage in legacy `name` columns. */
export function displayName(v: { first_name?: string | null; last_name?: string | null }) {
  return [v.first_name, v.last_name].filter(Boolean).join(" ").trim();
}

interface Props {
  value: PersonFields;
  onChange: (next: PersonFields) => void;
  /** When true, hides email field (e.g. invite flows where email lives elsewhere). */
  hideEmail?: boolean;
}

export default function PersonFieldsForm({ value, onChange, hideEmail }: Props) {
  const set = <K extends keyof PersonFields>(k: K, v2: PersonFields[K]) => onChange({ ...value, [k]: v2 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[110px_1fr_1fr] gap-2">
        <div>
          <Label className="text-[12px]">Title</Label>
          <Select value={value.title ?? ""} onValueChange={(v) => set("title", v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              {TITLE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[12px]">First name *</Label>
          <Input value={value.first_name} onChange={(e) => set("first_name", e.target.value)} />
        </div>
        <div>
          <Label className="text-[12px]">Last name *</Label>
          <Input value={value.last_name} onChange={(e) => set("last_name", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[12px]">Designation *</Label>
          <Input value={value.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. CEO" />
        </div>
        <div>
          <Label className="text-[12px]">Company *</Label>
          <Input value={value.company} onChange={(e) => set("company", e.target.value)} placeholder="Acme Inc." />
        </div>
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-2">
        <div>
          <Label className="text-[12px]">Code *</Label>
          <CountryCodePicker value={value.mobile_country_code} onChange={(dial) => set("mobile_country_code", dial)} />
        </div>
        <div>
          <Label className="text-[12px]">Mobile number *</Label>
          <Input
            inputMode="numeric"
            value={value.mobile_number}
            onChange={(e) => set("mobile_number", e.target.value.replace(/[^\d]/g, ""))}
            placeholder="9876543210"
          />
        </div>
      </div>

      {!hideEmail && (
        <div>
          <Label className="text-[12px]">Email address *</Label>
          <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} />
        </div>
      )}

      <div className="pt-2 border-t border-border space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Optional</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[12px]">LinkedIn profile</Label>
            <Input value={value.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
          </div>
          <div>
            <Label className="text-[12px]">Company website</Label>
            <Input value={value.company_website} onChange={(e) => set("company_website", e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[12px]">Employees</Label>
            <Select value={value.company_employee_count} onValueChange={(v) => set("company_employee_count", v)}>
              <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_COUNT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Industry</Label>
            <Select value={value.industry} onValueChange={(v) => set("industry", v)}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}