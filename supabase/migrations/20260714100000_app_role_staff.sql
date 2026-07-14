-- Room scanner Phase 1A (master plan §6.2): add the explicit `staff` role.
-- MUST be its own migration: PostgreSQL cannot use a newly added enum value
-- inside the transaction that adds it. Every reference to 'staff' lives in
-- later migration files.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';
