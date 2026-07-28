-- ============================================================================
-- Event ↔ Venue Vendor connection
-- ----------------------------------------------------------------------------
-- When an organizer picks a venue from the vendor marketplace during event
-- setup, this table records the connection. Both apps (Illuxus + Vendor
-- Connect) can read/write it since they share the same Supabase project.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_venue_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  selected_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'contacted'
    CHECK (status IN ('contacted', 'accepted', 'declined', 'cancelled')),
  notes text,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_event_venue_selections_event
  ON event_venue_selections (event_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_vendor
  ON event_venue_selections (vendor_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_org
  ON event_venue_selections (org_id);

ALTER TABLE event_venue_selections ENABLE ROW LEVEL SECURITY;

-- Organizers (event owners) can manage their own selections
DROP POLICY IF EXISTS event_venue_selections_org_manage ON event_venue_selections;
CREATE POLICY event_venue_selections_org_manage
  ON event_venue_selections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_venue_selections.event_id
        AND (e.user_id = auth.uid() OR e.org_id = event_venue_selections.org_id)
    )
  );

-- Vendors can see selections targeting them
DROP POLICY IF EXISTS event_venue_selections_vendor_read ON event_venue_selections;
CREATE POLICY event_venue_selections_vendor_read
  ON event_venue_selections
  FOR SELECT
  USING (is_vendor_member(auth.uid(), vendor_id));

-- Vendors can respond (accept/decline)
DROP POLICY IF EXISTS event_venue_selections_vendor_respond ON event_venue_selections;
CREATE POLICY event_venue_selections_vendor_respond
  ON event_venue_selections
  FOR UPDATE
  USING (is_vendor_member(auth.uid(), vendor_id));
