# Kitchen Planner Release Checklist

This is the operational release gate for `docs/ONE-SHOT-GREEN-PLAN-2026-07-30.md`.

## Before merge

- [ ] Pull request targets `main` from the programme branch.
- [ ] GitHub release checks are required and green.
- [ ] No unexpected files or unrelated user changes are included.
- [ ] Database migrations and Edge Function changes have explicit deployment notes.
- [ ] Feature controls are documented for the release environment.
- [ ] Public and staff route access expectations are recorded.
- [ ] A rollback tag identifies the last known-good production commit.

## Release candidate

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run test:ci` passes.
- [ ] Five golden kitchens pass desktop and mobile review.
- [ ] Manual planner, AI fallback, scanner fallback, and AR fallback pass.
- [ ] Supported scanner and AR device evidence is attached.
- [ ] Ten idempotent test enquiries reach Admin Leads exactly once each.
- [ ] Analytics contains no customer contact details.
- [ ] RLS, roles, CORS, rate limits, consent, and staff notifications pass.
- [ ] Public entry route stays within the agreed bundle budget.

## Production

- [ ] Public website and homeowner planner open in an incognito session without Cloudflare Access.
- [ ] Admin and trade routes reject unauthorised access.
- [ ] Website CTA reaches the planner.
- [ ] A controlled production enquiry reaches the assigned staff owner.
- [ ] Error monitoring and funnel events are visible.
- [ ] Rollback command/version has been checked.
- [ ] Production soak has run for 72 hours without a critical or high-severity regression.

## Rollback triggers

Rollback or disable the affected feature when:

- public access or staff access control is wrong;
- the planner loses or corrupts a saved design;
- displayed and submitted designs or prices disagree;
- enquiries are lost or duplicated;
- contact PII appears in analytics;
- scanner confirmation can be bypassed on low confidence;
- AR scale is outside the accepted tolerance;
- AI failure blocks the deterministic planner.
