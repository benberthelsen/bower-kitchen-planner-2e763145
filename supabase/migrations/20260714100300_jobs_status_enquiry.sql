-- The homeowner wizard creates jobs with status 'enquiry' and the admin
-- Leads/Dashboard/Jobs pages all filter on it, but jobs_status_check (both
-- the original bootstrap and 20260307's normalization) never allowed the
-- value — enquiry submission was broken at the database level. Rebuild the
-- constraint with 'enquiry' included.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_status_check
CHECK (status IN ('enquiry', 'draft', 'pending_approval', 'approved', 'in_production', 'completed'));
