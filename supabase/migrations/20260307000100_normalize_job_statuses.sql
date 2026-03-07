-- Normalize job status workflow for trade + admin consistency.
-- Canonical statuses: draft, pending_approval, approved, in_production, completed.

UPDATE public.jobs
SET status = 'pending_approval'
WHERE status = 'processing';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_status_check
CHECK (status IN ('draft', 'pending_approval', 'approved', 'in_production', 'completed'));
