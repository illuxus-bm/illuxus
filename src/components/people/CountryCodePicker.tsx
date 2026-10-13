/**
 * CountryCodePicker — the one phone country-code control used by every form.
 *
 * A searchable list (type a country name, its ISO code or its dial code).
 * When the field is empty it fills itself in: first from the browser's
 * language, then — if the visitor hasn't touched it yet — from the country
 * their IP address is in. A saved value is never replaced.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, detectCountryDial, detectDefaultDial } from "@/lib/phone-country";
import { cn } from "@/lib/utils";

export function CountryCodePicker({
  value,
  onChange,
  id,
  className,
  invalid,
  autoDetect = true,
  disabled,
}: {
  value: string;
  onChange: (dial: string) => void;
  id?: string;
  className?: string;
  invalid?: boolean;
  /** Fill an empty value from the visitor's location. Default true. */
  autoDetect?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The value this control filled in itself; a later, better guess may
  // replace it, but nothing the visitor chose or that was loaded.
  const autoFilled = useRef<string | null>(null);
  const touched = useRef(false);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!autoDetect || value) return;
    const guess = detectDefaultDial();
    autoFilled.current = guess;
    touched.current = false;
    onChange(guess);
    // Filling in the guess re-runs this effect, so the answer is checked
    // against the latest value rather than tied to this run.
    void detectCountryDial().then((dial) => {
      const { value: now, onChange: set } = latest.current;
      if (!mounted.current || touched.current || now !== guess || dial === now) return;
      autoFilled.current = dial;
      set(dial);
    });
    // Runs when the field becomes empty (a new or reset form), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, value === ""]);

  // Several countries share a code (+1 is the US and Canada); show the first.
  const selected = COUNTRIES.find((c) => c.dial === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Country code"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("w-full justify-between font-normal h-10 px-3", invalid && "border-destructive", className)}
        >
          <span className="truncate">{value ? (selected ? `${selected.code} ${value}` : value) : "Select"}</span>
          <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search country or code…" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.dial} ${c.name} ${c.code}`}
                  onSelect={() => {
                    touched.current = true;
                    onChange(c.dial);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.dial ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs mr-2 w-12 shrink-0">{c.dial}</span>
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CountryCodePicker;
