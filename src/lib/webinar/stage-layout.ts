/**
 * Stage layouts the webinar stage can draw. Kept apart from WebinarStage so
 * pages can narrow a database value without pulling LiveKit out of its lazy
 * chunk.
 */
export type StageLayout = "grid" | "speaker" | "sidebyside" | "pip";

const STAGE_LAYOUTS: readonly StageLayout[] = ["grid", "speaker", "sidebyside", "pip"];

/** Narrows a layout read from the database; anything unknown shows as a grid. */
export function toStageLayout(value: string | null | undefined): StageLayout {
  return STAGE_LAYOUTS.includes(value as StageLayout) ? (value as StageLayout) : "grid";
}
