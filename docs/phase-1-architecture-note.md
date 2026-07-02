# Phase 1 Architecture Note (Canonical trade workflow)

## Canonical paths and state
- Product workflow is `/trade/*` only.
- Canonical planner state is `TradeRoomProvider` (`src/contexts/TradeRoomContext.tsx`) mounted at app root in `src/main.tsx`.
- Canonical persisted design shape is `jobs.design_data.tradeRooms` managed via `useTradeJobPersistence`.

## Legacy/deprecated areas (frozen)
- Legacy planner route aliases (`/`, `/trade-planner`, `/consumer/*`) now redirect into `/trade/dashboard`.
- `src/store/PlannerContext.tsx` remains legacy-only and is marked deprecated in-code.

## Canonical status model
- Canonical job statuses: `draft`, `pending_approval`, `approved`, `in_production`, `completed`.
- Shared type and labels are in `src/types/trade.ts`.
- Admin + trade hooks/pages consume canonical status helpers (`isTradeJobStatus`, `statusToGroup`, `TRADE_JOB_STATUS_LABELS`).

## Dead-code cleanup candidates (post-phase)
- Remove legacy planner pages/hooks/components once migration sign-off is complete:
  - `src/pages/Index.tsx`
  - `src/pages/TradePlanner.tsx`
  - `src/store/PlannerContext.tsx`
  - legacy planner hooks/components referenced from PlannerContext deprecation note.
