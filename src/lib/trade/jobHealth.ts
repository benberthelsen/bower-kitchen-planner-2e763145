import type { TradeJobStatus } from '@/types/trade';

export const STALE_QUOTE_DAYS = 7;

export function isQuoteInProgress(status: TradeJobStatus): boolean {
  return status === 'draft' || status === 'pending_approval';
}

export function getDaysSinceUpdated(updatedAt: string | null, nowMs = Date.now()): number | null {
  if (!updatedAt) return null;

  const updatedAtMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return null;

  const elapsedMs = Math.max(0, nowMs - updatedAtMs);
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}

export function isStaleQuote(status: TradeJobStatus, updatedAt: string | null, staleDays = STALE_QUOTE_DAYS): boolean {
  if (!isQuoteInProgress(status)) return false;

  const daysSinceUpdate = getDaysSinceUpdated(updatedAt);
  return daysSinceUpdate !== null && daysSinceUpdate >= staleDays;
}
