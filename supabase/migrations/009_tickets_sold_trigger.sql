-- ============================================================================
-- Maintain `events.tickets_sold` automatically from `registrations`
-- ----------------------------------------------------------------------------
-- The `events.tickets_sold` column has existed since 001_tables but no trigger
-- ever populated it, so the organizer dashboard's event card and the Tickets
-- page have always shown 0/N tickets even after attendees register. The public
-- RSVP card sidesteps this by computing capacity live from the `registrations`
-- table on every render (see src/components/EventRsvpCard.tsx), but organizer
-- surfaces read the column directly and have no realtime fallback.
--
-- This migration:
--   1. Adds `_recompute_tickets_sold(event_id)` — single-event recount helper.
--   2. Adds a trigger on `registrations` that calls the helper after
--      INSERT / DELETE / UPDATE of any field that affects the count
--      (`status`, `approval_status`, `event_id`).
--   3. Backfills `tickets_sold` for every event using the same predicate so
--      existing rows are correct on day one.
--
-- "Sold" predicate matches what EventRsvpCard.tsx and the communications
-- resolver in 007_communications.sql already use:
--     status <> 'cancelled'
--     AND COALESCE(approval_status, 'approved') NOT IN ('declined','waitlisted')
-- i.e. confirmed seats only — no cancellations, declines, or waitlist.
-- ============================================================================

-- ── 1. Single-event recount helper
CREATE OR REPLACE FUNCTION public._recompute_tickets_sold(_eid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
     SET tickets_sold = COALESCE((
           SELECT count(*)
             FROM public.registrations r
            WHERE r.event_id = _eid
              AND r.status <> 'cancelled'
              AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
         ), 0)
   WHERE e.id = _eid;
END;
$$;

-- ── 2. Trigger function — handles INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION public._registrations_tickets_sold_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    -- Registration moved between events; recount both.
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  ELSE
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS registrations_tickets_sold_trg ON public.registrations;
CREATE TRIGGER registrations_tickets_sold_trg
AFTER INSERT OR DELETE OR UPDATE OF status, approval_status, event_id
ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._registrations_tickets_sold_trg();

-- ── 3. Backfill all existing events so day-one numbers are correct.
UPDATE public.events e
   SET tickets_sold = COALESCE((
         SELECT count(*)
           FROM public.registrations r
          WHERE r.event_id = e.id
            AND r.status <> 'cancelled'
            AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
       ), 0);
