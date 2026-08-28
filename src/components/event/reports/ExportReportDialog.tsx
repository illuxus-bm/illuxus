import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, RotateCcw, CheckSquare, Square } from "lucide-react";

export type ExportField = {
  key: string;
  label: string;
  group: string;
  defaultOn?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fields: ExportField[];
  rowCount: number;
  /** Storage key for remembering the last selection (per event/section) */
  storageKey?: string;
  onConfirm: (selectedKeys: string[]) => void;
};

function loadSaved(key?: string): string[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function ExportReportDialog({
  open, onOpenChange, fields, rowCount, storageKey, onConfirm,
}: Props) {
  const defaultKeys = useMemo(
    () => fields.filter((f) => f.defaultOn).map((f) => f.key),
    [fields],
  );

  const [selected, setSelected] = useState<Set<string>>(() => {
    const saved = loadSaved(storageKey);
    return new Set(saved && saved.length > 0 ? saved : defaultKeys);
  });

  // Reset to saved/default whenever the dialog re-opens (so each open is fresh)
  useEffect(() => {
    if (!open) return;
    const saved = loadSaved(storageKey);
    setSelected(new Set(saved && saved.length > 0 ? saved : defaultKeys));
  }, [open, storageKey, defaultKeys]);

  const groups = useMemo(() => {
    const map = new Map<string, ExportField[]>();
    for (const f of fields) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return Array.from(map.entries());
  }, [fields]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      // if/else rather than a ternary-as-statement (see `no-unused-expressions`).
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (groupFields: ExportField[]) => {
    const allOn = groupFields.every((f) => selected.has(f.key));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of groupFields) {
        if (allOn) next.delete(f.key);
        else next.add(f.key);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(fields.map((f) => f.key)));
  const selectNone = () => setSelected(new Set());
  const resetDefaults = () => setSelected(new Set(defaultKeys));

  const handleDownload = () => {
    const ordered = fields.filter((f) => selected.has(f.key)).map((f) => f.key);
    if (ordered.length === 0) return;
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(ordered)); } catch { /* ignore */ }
    }
    onConfirm(ordered);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Download className="h-4 w-4" /> Choose fields to export
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Pick the columns you want in the CSV. {rowCount} {rowCount === 1 ? "row" : "rows"} will be exported.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={selectAll}>
            <CheckSquare className="h-3 w-3" /> Select all
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={selectNone}>
            <Square className="h-3 w-3" /> Clear
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={resetDefaults}>
            <RotateCcw className="h-3 w-3" /> Reset to defaults
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {selected.size} of {fields.length} selected
          </span>
        </div>

        {/* Grouped checklist */}
        <div className="max-h-[55vh] overflow-y-auto -mx-6 px-6 divide-y divide-border">
          {groups.map(([group, groupFields]) => {
            const allOn = groupFields.every((f) => selected.has(f.key));
            const someOn = !allOn && groupFields.some((f) => selected.has(f.key));
            return (
              <section key={group} className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </h4>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupFields)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {allOn ? "Unselect all" : someOn ? "Select all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {groupFields.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 text-[13px] cursor-pointer rounded px-1.5 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(f.key)}
                        onCheckedChange={() => toggle(f.key)}
                      />
                      <span className="truncate">{f.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleDownload}
            disabled={selected.size === 0 || rowCount === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
