-- FOLLOW-UP to 20261011100000_lead_integrity.sql. NOT part of that apply.
--
-- Apply only once the link-trade-handoff edge function that calls
-- link_trade_handoff_v2 with the token's hash is deployed and the planner
-- frontend that sends the token is live. Browsers reach the link RPC only
-- through that function, so after this the tokenless v1 can no longer be
-- called by any signed-in account through /rest/v1/rpc.
--
-- Until then a link from a tab running the old frontend fails quietly, which
-- the planner tolerates: linking is non-fatal by design.
DO $$
BEGIN
  IF to_regprocedure('public.link_trade_handoff_v1(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.link_trade_handoff_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
