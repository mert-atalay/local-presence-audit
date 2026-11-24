import { statusFor } from '../score.js';
import type { CheckResult, Place } from '../types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function recencyScore(ageDays: number): number {
  if (ageDays <= 30) return 100;
  if (ageDays <= 90) return 80;
  if (ageDays <= 180) return 55;
  if (ageDays <= 365) return 30;
  return 10;
}

export function checkRecency(place: Place, now: Date): CheckResult {
  const base = { id: 'recency' as const, title: 'Review recency' };
  const times = (place.reviews ?? [])
    .map((review) => (review.publishTime ? Date.parse(review.publishTime) : NaN))
    .filter((time) => Number.isFinite(time));

  if (times.length === 0) {
    return {
      ...base,
      score: null,
      status: 'skipped',
      summary: 'The API returned no dated reviews, so recency could not be judged.',
      details: [],
      fixes: [],
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - Math.max(...times)) / DAY_MS));
  const score = recencyScore(ageDays);
  const sample = `Based on a sample of ${times.length} review${times.length === 1 ? '' : 's'}. The API returns at most 5, picked by relevance, so a newer review may exist.`;

  return {
    ...base,
    score,
    status: statusFor(score),
    summary: `The newest review in the sample is ${ageDays} day${ageDays === 1 ? '' : 's'} old.`,
    details: [sample],
    fixes:
      ageDays > 180
        ? [
            {
              priority: 'medium',
              text: `No review newer than ${ageDays} days in the sample. Check the listing, and if that holds, ask recent customers for reviews.`,
            },
          ]
        : [],
  };
}
