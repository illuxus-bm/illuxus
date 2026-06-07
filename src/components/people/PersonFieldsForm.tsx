import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRIES, EMPLOYEE_COUNT_OPTIONS, INDUSTRY_OPTIONS, TITLE_OPTIONS, detectDefaultDial } from "@/lib/phone-country";
import { useEffect, useState } from "react";
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
  mobile_country_code: detectDefaultDial(),
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
  // Initialise dial code on mount if missing.
  useEffect(() => {
    if (!value.mobile_country_code) onChange({ ...value, mobile_country_code: detectDefaultDial() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof PersonFields>(k: K, v2: PersonFields[K]) => onChange({ ...value, [k]: v2 });
  const [codeOpen, setCodeOpen] = useState(false);
  const selectedCountry = COUNTRIES.find((c) => c.dial === value.mobile_country_code);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[110px_1fr_1fr] gap-2">
        <div>
          <Label className="text-[12px]">Title</Label>
          <Select value={value.title || undefined} onValueChange={(v) => set("title", v)}>
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

      <div className="grid grid-cols-[140px_1fr] gap-2">
        <div>
          <Label className="text-[12px]">Code *</Label>
          <Popover open={codeOpen} onOpenChange={setCodeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={codeOpen}
                className="w-full justify-between font-normal h-10 px-3"
              >
                <span className="truncate">{selectedCountry ? selectedCountry.dial : "Select"}</span>
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command
                filter={(itemValue, search) => {
                  // itemValue carries "<dial>|<name>|<code>" for robust matching
                  return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                }}
              >
                <CommandInput placeholder="Search country or code…" />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No country found.</CommandEmpty>
                  <CommandGroup>
                    {COUNTRIES.map((c) => (
                      <CommandItem
                        key={c.code}
                        value={`${c.dial} ${c.name} ${c.code}`}
                        onSelect={() => {
                          set("mobile_country_code", c.dial);
                          setCodeOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value.mobile_country_code === c.dial ? "opacity-100" : "opacity-0")} />
                        <span className="font-mono text-xs mr-2 w-12 shrink-0">{c.dial}</span>
                        <span className="truncate">{c.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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