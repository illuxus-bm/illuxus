# Brochure Editor — Requirements

## Introduction

A Canva-like WYSIWYG editor for the event brochure module. Organizers open the
editor, land on an editable canvas pre-populated from a template (Poster Bold,
Corporate Bold, etc.), and can freely modify every element — text, images,
shapes, pills, backgrounds — via direct manipulation on the canvas and a
per-element properties panel. The edited document is the source of truth for
the PDF export; jsPDF template rendering is replaced by a canvas-to-PDF export
pipeline.

Ships incrementally as a multi-phase feature. Phase 1 delivers the foundation:
data model, canvas engine, selection, drag, resize, template pre-loading, and
edit-driven PDF export. Later phases add the properties panel, element palette,
page management, undo/redo, snap guides, keyboard shortcuts, and effects.

## Glossary

- **Brochure_Document** — the full serializable state for one brochure: an
  ordered list of pages plus document-level metadata (title, theme,
  organizer/social branding).
- **Brochure_Page** — one page in the document; carries a background style
  (solid, gradient, image) and an ordered list of elements (Z-order = array
  index).
- **Brochure_Element** — one visible thing on a page. Discriminated union
  by `kind`: `text`, `image`, `shape`, `pill`. Every element carries `x`, `y`,
  `width`, `height`, `rotation`, `opacity`, plus kind-specific fields (text
  content + font, image URL + fit, shape fill + stroke, pill text + colors).
- **Selection** — the set of currently-active element ids for the active page.
  Single-select or multi-select.
- **Editor_Canvas** — the interactive Konva `Stage` that renders the active
  page's Brochure_Elements and mediates every mouse/keyboard interaction.
- **Template_Preset** — a code-defined Brochure_Document seed (Poster Bold,
  Corporate Bold, etc.). Selecting a template creates a new document with the
  same elements pre-populated from the template's data, then the organizer
  edits from there.

## Requirements

### Requirement 1: Document data model

**User Story:** As a developer, I want a serializable Brochure_Document data
model so the editor state can be persisted to Supabase and reloaded verbatim.

#### Acceptance Criteria

1. THE Brochure_Document type SHALL be a plain JSON-serializable object with
   `id`, `title`, `pages`, and `createdAt`/`updatedAt` fields.
2. THE Brochure_Page type SHALL carry `id`, `background` (solid/gradient/image
   discriminated union), `width` (mm), `height` (mm), and `elements` (ordered
   array).
3. THE Brochure_Element type SHALL be a discriminated union over `kind`
   (`text` | `image` | `shape` | `pill`) with shared geometry fields
   (`x`, `y`, `width`, `height`, `rotation`, `opacity`, `zIndex`).
4. WHERE a Brochure_Element's `id` is not unique within its page, THE editor
   SHALL treat the second occurrence as a fresh clone with a new generated id.
5. THE serialization roundtrip (`JSON.stringify` → `JSON.parse` → validate)
   SHALL preserve every property byte-for-byte.

### Requirement 2: Canvas rendering

**User Story:** As an organizer, I want the editor to render my document
accurately so the on-screen preview matches the exported PDF.

#### Acceptance Criteria

1. THE Editor_Canvas SHALL render the active page's background (solid,
   gradient, or image fit) followed by every element in `zIndex` order.
2. WHEN a text element has content longer than its width, THE canvas SHALL
   wrap the text and clip to the element's height.
3. WHEN an image element's URL fails to load, THE canvas SHALL render a gray
   placeholder rectangle with a small icon center, not throw.
4. THE canvas SHALL render at a fixed zoom level that fits the page inside
   the available viewport with 20mm margin on all sides.

### Requirement 3: Selection and drag

**User Story:** As an organizer, I want to click and drag elements to
reposition them.

#### Acceptance Criteria

1. WHEN the user clicks on an element, THE editor SHALL set it as the
   Selection.
2. WHEN the user clicks on empty canvas, THE editor SHALL clear the Selection.
3. WHEN the Selection is non-empty, THE editor SHALL render a blue selection
   outline around the selected element.
4. WHEN the user drags a selected element, THE editor SHALL update its `x`
   and `y` while dragging.
5. WHEN the drag ends, THE editor SHALL commit the new `x`/`y` to the
   document state.

### Requirement 4: Resize and rotate

**User Story:** As an organizer, I want handles on selected elements to
resize and rotate them.

#### Acceptance Criteria

1. WHEN an element is selected, THE editor SHALL render corner and edge
   resize handles.
2. WHEN the user drags a corner handle, THE editor SHALL scale the element
   preserving aspect ratio for image elements, and free-scale for text and
   shape elements.
3. WHEN the user drags an edge handle, THE editor SHALL resize the element
   in one dimension only.
4. WHEN an element is selected, THE editor SHALL render a rotation handle
   above the top-center of the element.
5. WHEN the user drags the rotation handle, THE editor SHALL update the
   element's `rotation` field.

### Requirement 5: Template pre-loading

**User Story:** As an organizer, when I open the editor for a brochure, I
want to start from one of the existing themes (Poster Bold, Corporate Bold)
so I don't have to build the layout from scratch.

#### Acceptance Criteria

1. WHEN the editor opens for an event with a saved Brochure_Document, THE
   editor SHALL load the saved document.
2. WHEN the editor opens for an event without a saved Brochure_Document, THE
   editor SHALL prompt the user to pick a template.
3. WHEN the user picks a template, THE editor SHALL create a new document
   with elements pre-populated from the template's data (cover title, date,
   agenda, speakers, etc. pulled from the event).
4. AT LEAST TWO templates SHALL be shipped in Phase 1: Poster Bold and
   Corporate Bold.

### Requirement 6: PDF export

**User Story:** As an organizer, when I click Download, I want a PDF that
matches what I see in the editor.

#### Acceptance Criteria

1. WHEN the user clicks Export, THE editor SHALL render each page's Konva
   stage to a high-DPI PNG.
2. THE PDF export SHALL stamp each PNG onto a corresponding jsPDF page at
   full page dimensions.
3. THE export SHALL respect the document's page dimensions (A4 portrait by
   default).
4. THE export SHALL trigger a browser download with a filename derived from
   the document title.

### Requirement 7: Persistence

**User Story:** As an organizer, I want my edits saved automatically so I
don't lose work between sessions.

#### Acceptance Criteria

1. WHEN any element changes, THE editor SHALL debounce a save to Supabase
   at ~1 second after the last edit.
2. THE save SHALL persist the Brochure_Document JSON to a durable store
   (either `events.page_config.brochureDocument` or a new
   `brochure_documents` table keyed by `event_id`).
3. WHEN the save fails, THE editor SHALL surface a toast and retain the
   document in the client state so the user can retry.

## Phase 1 Scope

Phase 1 delivers Requirements 1, 2, 3, 4, 5, 6 with a limited set of element
types (text, image, shape, pill) and a limited set of interactions (single-
select, drag, resize with corner+edge handles, rotate). Requirement 7
(persistence) uses a stubbed in-memory store that survives dialog re-open
within the same session; Supabase persistence lands in Phase 2.

Later phases (out of scope for Phase 1):
- Properties panel for direct property editing
- Element palette (add new text/image/shape/pill from a sidebar)
- Page management (add/delete/reorder pages)
- Undo/redo history stack
- Snap-to-guide alignment
- Keyboard shortcuts (Del, arrow-key nudge, Cmd+Z, Cmd+D, etc.)
- Multi-select with box drag
- Effect/filter properties (shadow, blur, tint)
- Full Supabase persistence with auto-save
