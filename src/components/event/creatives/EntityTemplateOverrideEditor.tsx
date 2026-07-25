/**
 * EntityTemplateOverrideEditor — per-speaker / per-sponsor template override
 * editor (Creative_Customization spec, Requirements 10.1, 10.2, 10.4, 10.5).
 *
 * Mounted inside `CustomizationPanel`'s "Entity override" section when an
 * entity is selected in the parent dialog. Reads the effective template via
 * `readEffectiveTemplateId(pageConfig, entityId, creativeType)`, shows the
 * resolved name in an info line, and lets the organizer:
 *
 *  1. Pick any template compatible with the entity's `CreativeType` — the
 *     built-in presets from `templatesFor(creativeType)` plus any
 *     Custom_Template stored on `page_config.customCreativeTemplates` that
 *     matches the type (each Custom_Template is suffixed with a "Custom"
 *     badge so the organizer can tell it apart from a built-in preset).
 *  2. Save the pick as the entity's default via `saveEntityTemplateOverride`,
 *     handing the resulting `EventPageConfig` back to the parent through the
 *     `onSavePageConfig` callback (Requirement 10.2).
 *  3. Clear an existing per-entity override via `clearEntityTemplateOverride`
 *     (Requirement 10.5).
 *
 * Errors surface via `toast.error` from `sonner` and are logged through the
 * project's `logger` (never `console.*`, per project conventions).
 *
 * When `pageConfig` is missing (typically because the event hasn't been
 * saved yet) the editor renders a small disabled hint instead of the
 * picker — there is no `page_config.creativeTemplatePrefs.perEntity` to
 * write into.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { logger } from "@/lib/observability";
import {
  clearEntityTemplateOverride,
  readEffectiveTemplateId,
  saveEntityTemplateOverride,
  templatesFor,
  type CreativeType,
} from "@/lib/creatives/creative-templates";
import type { EventPageConfig } from "@/components/event/page-form/types";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface EntityTemplateOverrideEditorProps {
  entityId: string;
  creativeType: CreativeType;
  pageConfig?: EventPageConfig;
  onSavePageConfig?: (config: EventPageConfig) => Promise<void>;
}

// ─── Local option shape (built-in preset OR Custom_Template) ────────────────

interface TemplateOption {
  id: string;
  name: string;
  isCustom: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EntityTemplateOverrideEditor({
  entityId,
  creativeType,
  pageConfig,
  onSavePageConfig,
}: EntityTemplateOverrideEditorProps) {
  // Every built-in preset for this CreativeType, plus every Custom_Template
  // on the current event that targets this same CreativeType (Requirement
  // 10.1). Recomputed only when the type or the custom-templates list
  // changes.
  const options = useMemo<TemplateOption[]>(() => {
    const builtIns: TemplateOption[] = templatesFor(creativeType).map((t) => ({
      id: t.id,
      name: t.name,
      isCustom: false,
    }));
    const custom: TemplateOption[] = (pageConfig?.customCreativeTemplates ?? [])
      .filter((t) => t.type === creativeType)
      .map((t) => ({ id: t.id, name: t.name, isCustom: true }));
    return [...builtIns, ...custom];
  }, [creativeType, pageConfig?.customCreativeTemplates]);

  // Resolve the effective template via the shared precedence helper — a
  // per-entity override wins over the per-type default (Requirement 10.3 /
  // Property 46). Fall back to the first built-in preset when nothing is
  // saved so the info line always shows a real template name.
  const perEntityTemplateId = pageConfig?.creativeTemplatePrefs?.perEntity?.[entityId];
  const isOverride = Boolean(perEntityTemplateId);
  const effectiveTemplateId = pageConfig
    ? readEffectiveTemplateId(pageConfig, entityId, creativeType)
    : undefined;
  const resolvedTemplateId = effectiveTemplateId ?? options[0]?.id;

  const [selectedId, setSelectedId] = useState<string>(resolvedTemplateId ?? "");
  const [saving, setSaving] = useState<boolean>(false);

  // Early guard: without a `pageConfig` we have nothing to write into.
  // Requirement 10.2 persists to `page_config.creativeTemplatePrefs.perEntity`,
  // which only exists once the event has been saved.
  if (!pageConfig) {
    return (
      <div className="text-xs text-muted-foreground">
        Save the event first to configure per-entity overrides.
      </div>
    );
  }

  const currentOption = options.find((o) => o.id === resolvedTemplateId);
  const currentLabel = currentOption?.name ?? "Unknown";
  const canPersist = Boolean(onSavePageConfig);
  const saveDisabled = !canPersist || !selectedId || saving;
  const clearDisabled = !canPersist || !isOverride || saving;

  const handleSave = async () => {
    if (!onSavePageConfig || !selectedId) return;
    setSaving(true);
    try {
      const next = saveEntityTemplateOverride(pageConfig, entityId, selectedId);
      await onSavePageConfig(next);
      toast.success("Template override saved");
    } catch (error) {
      logger.error("entity template override save failed", {
        entity_id: entityId,
        creative_type: creativeType,
        template_id: selectedId,
        error_message: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to save template override");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!onSavePageConfig) return;
    setSaving(true);
    try {
      const next = clearEntityTemplateOverride(pageConfig, entityId);
      await onSavePageConfig(next);
      toast.success("Template override cleared");
    } catch (error) {
      logger.error("entity template override clear failed", {
        entity_id: entityId,
        creative_type: creativeType,
        error_message: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to clear template override");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="text-[11px] text-muted-foreground">
        Current: {currentLabel} ({isOverride ? "override" : "default"})
      </div>

      <Select
        value={selectedId}
        onValueChange={setSelectedId}
        disabled={saving || options.length === 0}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select a template" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <span className="inline-flex items-center gap-1.5">
                <span>{opt.name}</span>
                {opt.isCustom ? (
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1 py-0 leading-none"
                  >
                    Custom
                  </Badge>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? "Saving…" : "Save as default for this entity"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={clearDisabled}
        >
          Clear override
        </Button>
      </div>
    </div>
  );
}
