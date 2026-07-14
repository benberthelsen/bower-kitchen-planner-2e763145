-- AI Kitchen Designer V2 persistence foundation.
-- Public design sessions use a short-lived capability token through the Edge
-- Function. Browsers never receive direct table mutation access.

CREATE TABLE public.ai_designer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token_hash text NOT NULL UNIQUE CHECK (public_token_hash ~ '^[0-9a-f]{64}$'),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'homeowner' CHECK (source IN ('homeowner', 'trade', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'expired', 'revoked')),
  room_revision integer NOT NULL DEFAULT 1 CHECK (room_revision > 0),
  brief_revision integer NOT NULL DEFAULT 1 CHECK (brief_revision > 0),
  design_revision integer NOT NULL DEFAULT 0 CHECK (design_revision >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.ai_design_brief_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_designer_sessions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  room_revision integer NOT NULL CHECK (room_revision > 0),
  brief jsonb NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  brief_fingerprint text NOT NULL CHECK (brief_fingerprint ~ '^[0-9a-f]{64}$'),
  room_fingerprint text NOT NULL CHECK (room_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, revision),
  UNIQUE (session_id, brief_fingerprint)
);

CREATE TABLE public.ai_design_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_designer_sessions(id) ON DELETE CASCADE,
  brief_revision_id uuid NOT NULL REFERENCES public.ai_design_brief_revisions(id) ON DELETE RESTRICT,
  parent_proposal_id uuid REFERENCES public.ai_design_proposals(id) ON DELETE SET NULL,
  request_proposal_id text NOT NULL,
  design_revision integer NOT NULL CHECK (design_revision > 0),
  mode text NOT NULL CHECK (mode IN ('generate', 'refine', 'style')),
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'selected', 'stale', 'promoted', 'rejected')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  spec jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  compiled_items jsonb NOT NULL CHECK (jsonb_typeof(compiled_items) = 'array'),
  price_band jsonb NOT NULL CHECK (jsonb_typeof(price_band) = 'object'),
  violations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(violations) = 'array'),
  rationale text NOT NULL DEFAULT '',
  proposal_fingerprint text NOT NULL CHECK (proposal_fingerprint ~ '^[0-9a-f]{64}$'),
  rule_results_fingerprint text NOT NULL CHECK (rule_results_fingerprint ~ '^[0-9a-f]{64}$'),
  engine_version text NOT NULL,
  catalog_version text NOT NULL,
  pricing_version text NOT NULL,
  prompt_version text NOT NULL,
  model_provider text NOT NULL,
  model_id text NOT NULL,
  catalog_snapshot jsonb NOT NULL CHECK (jsonb_typeof(catalog_snapshot) = 'object'),
  pricing_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pricing_snapshot) = 'object'),
  quote_ready boolean NOT NULL DEFAULT false,
  selected_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, design_revision, proposal_fingerprint),
  CHECK (status <> 'selected' OR selected_at IS NOT NULL),
  CHECK (status <> 'promoted' OR promoted_at IS NOT NULL)
);

CREATE TABLE public.ai_design_rule_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ai_design_proposals(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error', 'warn', 'info')),
  outcome text NOT NULL CHECK (outcome IN ('pass', 'warning', 'blocked', 'pending', 'not-applicable')),
  owner text NOT NULL DEFAULT 'designer-review',
  message text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  result_fingerprint text NOT NULL CHECK (result_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, rule_id)
);

CREATE TABLE public.cabinet_catalog_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'bower-planner',
  catalog_version text NOT NULL,
  item_id text NOT NULL,
  supplier_source_id text,
  source_product_id uuid REFERENCES public.microvellum_products(id) ON DELETE SET NULL,
  name text NOT NULL,
  definition_id text NOT NULL,
  roles text[] NOT NULL CHECK (cardinality(roles) > 0),
  category text NOT NULL,
  mounting_class text NOT NULL CHECK (mounting_class IN ('base', 'wall', 'tall', 'opening', 'panel', 'filler')),
  width_config jsonb NOT NULL CHECK (jsonb_typeof(width_config) = 'object'),
  dimensions jsonb NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'),
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(constraints) = 'object'),
  corner_config jsonb CHECK (corner_config IS NULL OR jsonb_typeof(corner_config) = 'object'),
  renderable boolean NOT NULL DEFAULT true,
  priceable boolean NOT NULL DEFAULT true,
  customer_visible boolean NOT NULL DEFAULT false,
  trade_visible boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'provisional' CHECK (approval_status IN ('provisional', 'approved', 'retired')),
  quote_ready boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, catalog_version, item_id),
  CHECK (NOT quote_ready OR approval_status = 'approved'),
  CHECK (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE public.ai_regulatory_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  version text NOT NULL,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('AU-ACT', 'AU-NSW', 'AU-NT', 'AU-QLD', 'AU-SA', 'AU-TAS', 'AU-VIC', 'AU-WA')),
  project_scopes text[] NOT NULL CHECK (cardinality(project_scopes) > 0),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_key, version, jurisdiction),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_ai_designer_sessions_expiry ON public.ai_designer_sessions(expires_at) WHERE status = 'active';
CREATE INDEX idx_ai_designer_sessions_job ON public.ai_designer_sessions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_ai_design_briefs_session ON public.ai_design_brief_revisions(session_id, revision DESC);
CREATE INDEX idx_ai_design_proposals_session ON public.ai_design_proposals(session_id, design_revision DESC);
CREATE INDEX idx_ai_design_proposals_parent ON public.ai_design_proposals(parent_proposal_id) WHERE parent_proposal_id IS NOT NULL;
CREATE INDEX idx_ai_design_rule_results_proposal ON public.ai_design_rule_results(proposal_id);
CREATE INDEX idx_catalog_capabilities_roles ON public.cabinet_catalog_capabilities USING gin(roles);
CREATE INDEX idx_catalog_capabilities_product ON public.cabinet_catalog_capabilities(source_product_id);
CREATE INDEX idx_regulatory_profiles_lookup ON public.ai_regulatory_profiles(jurisdiction, effective_from, effective_to);

CREATE TRIGGER update_ai_designer_sessions_updated_at
  BEFORE UPDATE ON public.ai_designer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_cabinet_catalog_capabilities_updated_at
  BEFORE UPDATE ON public.cabinet_catalog_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ai_regulatory_profiles_updated_at
  BEFORE UPDATE ON public.ai_regulatory_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ai_designer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_design_brief_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_design_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_design_rule_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_catalog_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_regulatory_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_ai_designer_session(p_session_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.ai_designer_sessions s
    LEFT JOIN public.jobs j ON j.id = s.job_id
    WHERE s.id = p_session_id
      AND (
        s.owner_user_id = p_user
        OR j.customer_id = p_user
        OR public.is_bower_staff(p_user)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_ai_designer_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_ai_designer_session(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Authorized users can read AI designer sessions"
  ON public.ai_designer_sessions FOR SELECT TO authenticated
  USING (public.can_read_ai_designer_session(id, auth.uid()));

CREATE POLICY "Authorized users can read AI design briefs"
  ON public.ai_design_brief_revisions FOR SELECT TO authenticated
  USING (public.can_read_ai_designer_session(session_id, auth.uid()));

CREATE POLICY "Authorized users can read AI design proposals"
  ON public.ai_design_proposals FOR SELECT TO authenticated
  USING (public.can_read_ai_designer_session(session_id, auth.uid()));

CREATE POLICY "Authorized users can read AI rule results"
  ON public.ai_design_rule_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_design_proposals p
      WHERE p.id = proposal_id
        AND public.can_read_ai_designer_session(p.session_id, auth.uid())
    )
  );

CREATE POLICY "Staff can manage cabinet capabilities"
  ON public.cabinet_catalog_capabilities FOR ALL TO authenticated
  USING (public.is_bower_staff(auth.uid()))
  WITH CHECK (public.is_bower_staff(auth.uid()));

CREATE POLICY "Authenticated users can read approved cabinet capabilities"
  ON public.cabinet_catalog_capabilities FOR SELECT TO authenticated
  USING (approval_status = 'approved' OR public.is_bower_staff(auth.uid()));

CREATE POLICY "Staff can manage regulatory profiles"
  ON public.ai_regulatory_profiles FOR ALL TO authenticated
  USING (public.is_bower_staff(auth.uid()))
  WITH CHECK (public.is_bower_staff(auth.uid()));

CREATE POLICY "Authenticated users can read approved regulatory profiles"
  ON public.ai_regulatory_profiles FOR SELECT TO authenticated
  USING (status = 'approved' OR public.is_bower_staff(auth.uid()));

-- Atomic public-session creation. Only the service-role Edge Function can call
-- this function; the raw capability token is never stored.
CREATE OR REPLACE FUNCTION public.create_ai_designer_session_v1(
  p_token_hash text,
  p_brief jsonb,
  p_brief_fingerprint text,
  p_room_fingerprint text,
  p_expires_at timestamptz,
  p_source text DEFAULT 'homeowner'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_brief_id uuid := gen_random_uuid();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_brief_fingerprint IS NULL OR p_brief_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_room_fingerprint IS NULL OR p_room_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_brief IS NULL OR jsonb_typeof(p_brief) <> 'object'
     OR p_expires_at <= now()
     OR p_source NOT IN ('homeowner', 'trade', 'admin') THEN
    RAISE EXCEPTION 'invalid_ai_session' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ai_designer_sessions
    (id, public_token_hash, source, expires_at)
  VALUES
    (v_session_id, p_token_hash, p_source, p_expires_at);

  INSERT INTO public.ai_design_brief_revisions
    (id, session_id, revision, room_revision, brief, brief_fingerprint, room_fingerprint)
  VALUES
    (v_brief_id, v_session_id, 1, 1, p_brief, p_brief_fingerprint, p_room_fingerprint);

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'briefRevisionId', v_brief_id,
    'briefRevision', 1,
    'designRevision', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_designer_session_v1(text, jsonb, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_designer_session_v1(text, jsonb, text, text, timestamptz, text) TO service_role;

-- Atomic proposal persistence and optimistic revision check. Proposal IDs are
-- generated by the Edge Function and become the durable IDs returned to the
-- browser. A stale concurrent refinement cannot overwrite a newer revision.
CREATE OR REPLACE FUNCTION public.persist_ai_designer_proposals_v1(
  p_session_id uuid,
  p_expected_design_revision integer,
  p_brief_revision_id uuid,
  p_parent_proposal_id uuid,
  p_proposals jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.ai_designer_sessions%ROWTYPE;
  v_next_revision integer;
  v_proposal jsonb;
  v_proposal_id uuid;
  v_violation jsonb;
  v_count integer;
BEGIN
  IF p_proposals IS NULL OR jsonb_typeof(p_proposals) <> 'array' THEN
    RAISE EXCEPTION 'invalid_proposals' USING ERRCODE = 'P0001';
  END IF;
  v_count := jsonb_array_length(p_proposals);
  IF v_count < 1 OR v_count > 3 THEN
    RAISE EXCEPTION 'invalid_proposals' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session
  FROM public.ai_designer_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'active' OR v_session.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_ai_session' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.design_revision <> p_expected_design_revision THEN
    RAISE EXCEPTION 'stale_design_revision' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_design_brief_revisions
    WHERE id = p_brief_revision_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'invalid_brief_revision' USING ERRCODE = 'P0001';
  END IF;
  IF p_parent_proposal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_design_proposals
    WHERE id = p_parent_proposal_id AND session_id = p_session_id
      AND status IN ('validated', 'selected')
  ) THEN
    RAISE EXCEPTION 'invalid_parent_proposal' USING ERRCODE = 'P0001';
  END IF;

  v_next_revision := v_session.design_revision + 1;

  FOR v_proposal IN SELECT value FROM jsonb_array_elements(p_proposals)
  LOOP
    IF jsonb_typeof(v_proposal) <> 'object'
       OR (v_proposal->>'id') IS NULL
       OR (v_proposal->>'proposalFingerprint') !~ '^[0-9a-f]{64}$'
       OR (v_proposal->>'ruleResultsFingerprint') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'invalid_proposals' USING ERRCODE = 'P0001';
    END IF;

    v_proposal_id := (v_proposal->>'id')::uuid;
    INSERT INTO public.ai_design_proposals (
      id, session_id, brief_revision_id, parent_proposal_id,
      request_proposal_id, design_revision, mode, name, spec, compiled_items,
      price_band, violations, rationale, proposal_fingerprint,
      rule_results_fingerprint, engine_version, catalog_version,
      pricing_version, prompt_version, model_provider, model_id,
      catalog_snapshot, pricing_snapshot, quote_ready
    ) VALUES (
      v_proposal_id, p_session_id, p_brief_revision_id, p_parent_proposal_id,
      v_proposal->>'requestProposalId', v_next_revision, v_proposal->>'mode',
      v_proposal->>'name', v_proposal->'spec', v_proposal->'compiledItems',
      v_proposal->'priceBand', COALESCE(v_proposal->'violations', '[]'::jsonb),
      COALESCE(v_proposal->>'rationale', ''), v_proposal->>'proposalFingerprint',
      v_proposal->>'ruleResultsFingerprint', v_proposal->>'engineVersion',
      v_proposal->>'catalogVersion', v_proposal->>'pricingVersion',
      v_proposal->>'promptVersion', v_proposal->>'modelProvider',
      v_proposal->>'modelId', v_proposal->'catalogSnapshot',
      v_proposal->'pricingSnapshot', COALESCE((v_proposal->>'quoteReady')::boolean, false)
    );

    FOR v_violation IN SELECT value FROM jsonb_array_elements(COALESCE(v_proposal->'violations', '[]'::jsonb))
    LOOP
      INSERT INTO public.ai_design_rule_results (
        proposal_id, rule_id, severity, outcome, owner, message, evidence, result_fingerprint
      ) VALUES (
        v_proposal_id,
        COALESCE(v_violation->>'code', 'unknown-rule'),
        COALESCE(v_violation->>'severity', 'warn'),
        CASE WHEN v_violation->>'severity' = 'error' THEN 'blocked' ELSE 'warning' END,
        'designer-review',
        COALESCE(v_violation->>'message', ''),
        v_violation,
        COALESCE(v_violation->>'resultFingerprint', v_proposal->>'ruleResultsFingerprint')
      )
      ON CONFLICT (proposal_id, rule_id) DO NOTHING;
    END LOOP;
  END LOOP;

  IF p_parent_proposal_id IS NOT NULL THEN
    UPDATE public.ai_design_proposals
      SET status = 'selected', selected_at = COALESCE(selected_at, now())
      WHERE id = p_parent_proposal_id;
  END IF;

  UPDATE public.ai_designer_sessions
    SET design_revision = v_next_revision
    WHERE id = p_session_id;

  RETURN jsonb_build_object('designRevision', v_next_revision, 'proposalCount', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_ai_designer_proposals_v1(uuid, integer, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_ai_designer_proposals_v1(uuid, integer, uuid, uuid, jsonb) TO service_role;

-- Populate an auditable, provisional capability snapshot from the live
-- Microvellum catalogue. Inference never produces quote-ready capabilities;
-- Bower staff must review and approve exact roles and constraints.
CREATE OR REPLACE FUNCTION public.refresh_provisional_cabinet_capabilities_v1(p_catalog_version text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_catalog_version IS NULL OR length(trim(p_catalog_version)) = 0 THEN
    RAISE EXCEPTION 'invalid_catalog_version' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.cabinet_catalog_capabilities (
    source_system, catalog_version, item_id, supplier_source_id,
    source_product_id, name, definition_id, roles, category, mounting_class,
    width_config, dimensions, constraints, corner_config, renderable, priceable,
    customer_visible, trade_visible, priority, approval_status, quote_ready
  )
  SELECT
    'bower-planner', p_catalog_version, p.id::text, p.microvellum_link_id,
    p.id, p.name, p.id::text,
    CASE
      WHEN COALESCE(p.is_corner, false) THEN ARRAY['corner-base']::text[]
      WHEN COALESCE(p.is_sink, false) THEN ARRAY['sink-base']::text[]
      WHEN lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%dishwasher%' THEN ARRAY['dishwasher-opening']::text[]
      WHEN lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%cooktop%' THEN ARRAY['cooktop-base']::text[]
      WHEN lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%fridge%' THEN ARRAY['fridge-opening']::text[]
      WHEN lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%oven%' THEN ARRAY['oven-tower']::text[]
      WHEN COALESCE(p.drawer_count, 0) > 0 THEN ARRAY['drawer-base']::text[]
      WHEN lower(COALESCE(p.category, '')) = 'tall' THEN ARRAY['pantry-tall']::text[]
      WHEN lower(COALESCE(p.category, '')) = 'wall' THEN ARRAY['wall-storage']::text[]
      ELSE ARRAY['door-base']::text[]
    END,
    COALESCE(NULLIF(trim(p.category), ''), 'Base'),
    CASE
      WHEN lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%dishwasher%'
        OR lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%fridge%' THEN 'opening'
      WHEN lower(COALESCE(p.category, '')) = 'tall'
        OR lower(COALESCE(p.cabinet_type, '') || ' ' || p.name) LIKE '%oven%' THEN 'tall'
      WHEN lower(COALESCE(p.category, '')) = 'wall' THEN 'wall'
      ELSE 'base'
    END,
    jsonb_build_object(
      'mode', 'fixed',
      'allowedMm', jsonb_build_array(COALESCE(p.default_width, 600)::integer),
      'preferredMm', jsonb_build_array(COALESCE(p.default_width, 600)::integer)
    ),
    jsonb_build_object(
      'widthsMm', jsonb_build_array(COALESCE(p.default_width, 600)::integer),
      'heightMm', COALESCE(p.default_height, 870)::integer,
      'depthMm', COALESCE(p.default_depth, 575)::integer
    ),
    jsonb_build_object(
      'inferredFromMicrovellum', true,
      'visibleToStandard', COALESCE(p.visible_to_standard, false),
      'visibleToTrade', COALESCE(p.visible_to_trade, true)
    ),
    CASE WHEN COALESCE(p.is_corner, false) THEN jsonb_build_object(
      'cornerType', p.corner_type,
      'isBlind', COALESCE(p.is_blind, false),
      'blindDepthMm', p.blind_depth,
      'returnFiller', COALESCE(p.return_filler, false)
    ) ELSE NULL END,
    true, true,
    COALESCE(p.visible_to_standard, false),
    COALESCE(p.visible_to_trade, true),
    COALESCE(p.display_order, 0),
    'provisional', false
  FROM public.microvellum_products p
  ON CONFLICT (source_system, catalog_version, item_id) DO UPDATE
    SET supplier_source_id = EXCLUDED.supplier_source_id,
        source_product_id = EXCLUDED.source_product_id,
        name = EXCLUDED.name,
        definition_id = EXCLUDED.definition_id,
        roles = EXCLUDED.roles,
        category = EXCLUDED.category,
        mounting_class = EXCLUDED.mounting_class,
        width_config = EXCLUDED.width_config,
        dimensions = EXCLUDED.dimensions,
        constraints = EXCLUDED.constraints,
        corner_config = EXCLUDED.corner_config,
        renderable = EXCLUDED.renderable,
        priceable = EXCLUDED.priceable,
        customer_visible = EXCLUDED.customer_visible,
        trade_visible = EXCLUDED.trade_visible,
        priority = EXCLUDED.priority,
        updated_at = now()
    WHERE public.cabinet_catalog_capabilities.approval_status = 'provisional';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_provisional_cabinet_capabilities_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_provisional_cabinet_capabilities_v1(text) TO service_role;

-- Approved capability resolution is deterministic: closest allowed width,
-- then curated priority, then stable item identity. Provisional rows are never
-- returned by the quote-ready resolver.
CREATE OR REPLACE FUNCTION public.resolve_approved_cabinet_capability_v1(
  p_catalog_version text,
  p_role text,
  p_requested_width_mm integer
)
RETURNS TABLE(capability jsonb, resolved_width_mm integer, exact_width boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      to_jsonb(c) AS capability,
      (width_value.value::text)::integer AS width_mm,
      c.priority,
      c.item_id
    FROM public.cabinet_catalog_capabilities c
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(c.width_config->'allowedMm', '[]'::jsonb)
    ) AS width_value(value)
    WHERE c.catalog_version = p_catalog_version
      AND p_role = ANY(c.roles)
      AND c.approval_status = 'approved'
      AND c.quote_ready
      AND c.effective_from <= current_date
      AND (c.effective_to IS NULL OR c.effective_to >= current_date)
  )
  SELECT
    candidates.capability,
    candidates.width_mm,
    candidates.width_mm = p_requested_width_mm
  FROM candidates
  WHERE p_catalog_version IS NOT NULL
    AND length(trim(p_catalog_version)) > 0
    AND p_role IS NOT NULL
    AND length(trim(p_role)) > 0
    AND p_requested_width_mm > 0
  ORDER BY
    abs(candidates.width_mm - p_requested_width_mm),
    candidates.priority,
    candidates.item_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_approved_cabinet_capability_v1(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_approved_cabinet_capability_v1(text, text, integer) TO service_role;

SELECT public.refresh_provisional_cabinet_capabilities_v1('microvellum-products-v1');
