-- Adds the Customization_Config JSONB column to event_creatives.
-- Default of '{}'::jsonb means every existing row (and every new row from a
-- caller that doesn't opt into customization) stores an empty object,
-- preserving the Additivity_Invariant end-to-end.

alter table public.event_creatives
  add column if not exists customization jsonb not null default '{}'::jsonb;

comment on column public.event_creatives.customization is
  'Customization_Config JSONB for the Creative_Customization feature. Contains customPromptSlots, slotOverrides, positionNudges, backgroundOverlay, watermark, border, appliedBrandKitId, and snapshotTemplate. Default {} preserves base-spec render output.';
