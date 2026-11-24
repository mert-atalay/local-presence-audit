import type { CheckId, CheckResult, PrioritisedFix, Priority, Status } from './types.js';

/** Share of the overall score per check. Skipped checks are left out and the rest re-weighted. */
export const WEIGHTS: Record<CheckId, number> = {
  completeness: 25,
  reputation: 20,
  hours: 15,
  website: 15,
  competitors: 15,
  recency: 10,
};

export const PASS_AT = 80;
export const WARN_AT = 50;

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function statusFor(score: number | null): Status {
  if (score === null) return 'skipped';
  if (score >= PASS_AT) return 'pass';
  if (score >= WARN_AT) return 'warn';
  return 'fail';
}

/** Weighted mean of the checks that ran. Null when none ran. */
export function overallScore(checks: readonly CheckResult[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const check of checks) {
    if (check.score === null) continue;
    weighted += check.score * WEIGHTS[check.id];
    total += WEIGHTS[check.id];
  }
  return total === 0 ? null : Math.round(weighted / total);
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** All fixes, high priority first, then by the weight of the check they come from. */
export function prioritiseFixes(checks: readonly CheckResult[]): PrioritisedFix[] {
  const fixes = checks.flatMap((check) => check.fixes.map((fix) => ({ ...fix, check: check.id })));
  return fixes.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || WEIGHTS[b.check] - WEIGHTS[a.check],
  );
}
