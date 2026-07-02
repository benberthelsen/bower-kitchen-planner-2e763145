import type { TradeJobStatus } from '@/types/trade';

export const TRADE_STATUS_BADGE_STYLES: Record<TradeJobStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-amber-100 text-amber-900 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  in_production: 'bg-sky-100 text-sky-900 border-sky-200',
  completed: 'bg-green-100 text-green-900 border-green-200',
};
