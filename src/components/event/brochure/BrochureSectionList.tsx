import { GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import type { BrochureSectionId, SectionLayout } from "@/lib/brochure/brochure-templates";

interface Props {
  layout: SectionLayout;
  onChange: (layout: SectionLayout) => void;
}

/** Human-readable label for each fixed Brochure_Section id. Poster_Bold-
 *  and Corporate_Bold-specific ids are toggleable on any theme's section
 *  list — the renderer short-circuits them when the active theme doesn't
 *  produce that page, so an organizer toggling them on under a different
 *  theme silently does nothing rather than raising an error. */
const SECTION_LABELS: Record<BrochureSectionId, string> = {
  cover: "Cover",
  abstract: "Abstract & Learning Outcomes",
  whySponsor: "Why Sponsor?",
  agenda: "Agenda",
  speakers: "Speakers",
  sponsors: "Sponsors",
  pricing: "Pricing & Registration",
  venueLogistics: "Venue & Logistics",
  focusOfSummit: "Focus of the Summit",
  whoShouldAttend: "Who Should Attend",
  solutionProviders: "Solution Providers",
  highlights: "Why It Matters & What You'll Gain",
};

/**
 * Vertical `@dnd-kit/sortable` list of the five fixed Brochure_Sections,
 * each with a drag handle and an include/exclude `Switch`, mirroring
 * `SponsorManagement.tsx`'s `DndContext`/`SortableContext`/`useSortable`
 * pattern (Requirement 7.1).
 *
 * Deliberately has no controls to reorder individual speakers, sponsors,
 * or sessions within a section — this list only ever renders exactly the
 * five Brochure_Section rows (Requirement 7.5).
 */
export default function BrochureSectionList({ layout, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.findIndex((entry) => entry.id === active.id);
    const newIndex = layout.findIndex((entry) => entry.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(layout, oldIndex, newIndex));
  };

  const handleToggle = (id: BrochureSectionId, included: boolean) => {
    onChange(layout.map((entry) => (entry.id === id ? { ...entry, included } : entry)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={layout.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {layout.map((entry) => (
            <SortableSectionRow
              key={entry.id}
              id={entry.id}
              included={entry.included}
              onToggle={(included) => handleToggle(entry.id, included)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableSectionRow({
  id, included, onToggle,
}: {
  id: BrochureSectionId;
  included: boolean;
  onToggle: (included: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-3 border border-border rounded-lg bg-card px-3 py-2.5 transition-shadow",
        isDragging ? "opacity-60 shadow-lg" : "",
      ].join(" ")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${SECTION_LABELS[id]} section (press space to pick up, arrows to move, space to drop)`}
        className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium truncate">{SECTION_LABELS[id]}</span>
      <Switch
        checked={included}
        onCheckedChange={onToggle}
        aria-label={`${included ? "Exclude" : "Include"} ${SECTION_LABELS[id]} section`}
      />
    </div>
  );
}
