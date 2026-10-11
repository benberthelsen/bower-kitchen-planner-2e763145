/**
 * Admin Customers: who could be approved as a trade account. Accounts that
 * own jobs come first (most recent job activity first), then every other
 * account. Bower staff (admin or staff role) are left out: they already have
 * trade access through is_trade_or_staff. Approval state comes only from
 * trade_accounts, so nobody starts approved.
 */
export interface CandidateProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  user_type: string | null;
  created_at: string | null;
}

export interface CandidateJob {
  customer_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CandidateRole {
  user_id: string;
  role: string;
}

export interface TradeAccountRow {
  user_id: string;
  approved_at: string | null;
}

export interface TradeCandidate {
  profile: CandidateProfile;
  jobCount: number;
  firstJobAt: string | null;
  lastJobAt: string | null;
  approved: boolean;
  approvedAt: string | null;
}

const STAFF_ROLES = new Set(['admin', 'staff']);

// Missing or unreadable dates sort as the oldest.
const time = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function buildTradeCandidates(
  profiles: readonly CandidateProfile[],
  jobs: readonly CandidateJob[],
  roles: readonly CandidateRole[],
  tradeAccounts: readonly TradeAccountRow[],
): TradeCandidate[] {
  const staff = new Set(roles.filter((row) => STAFF_ROLES.has(row.role)).map((row) => row.user_id));
  const approvals = new Map(tradeAccounts.map((row) => [row.user_id, row.approved_at]));

  const stats = new Map<string, { count: number; first: string | null; last: string | null }>();
  for (const job of jobs) {
    if (!job.customer_id) continue;
    const entry = stats.get(job.customer_id) ?? { count: 0, first: null, last: null };
    const touched = job.updated_at ?? job.created_at;
    entry.count += 1;
    if (job.created_at && (entry.first === null || time(job.created_at) < time(entry.first))) entry.first = job.created_at;
    if (touched && (entry.last === null || time(touched) > time(entry.last))) entry.last = touched;
    stats.set(job.customer_id, entry);
  }

  return profiles
    .filter((profile) => !staff.has(profile.id))
    .map((profile) => {
      const owned = stats.get(profile.id);
      return {
        profile,
        jobCount: owned?.count ?? 0,
        firstJobAt: owned?.first ?? null,
        lastJobAt: owned?.last ?? null,
        approved: approvals.has(profile.id),
        approvedAt: approvals.get(profile.id) ?? null,
      };
    })
    .sort((a, b) => Number(b.jobCount > 0) - Number(a.jobCount > 0)
      || time(b.lastJobAt) - time(a.lastJobAt)
      || time(b.profile.created_at) - time(a.profile.created_at));
}
