import { clamp, statusFor } from '../score.js';
import type { CheckResult, Fix, Place } from '../types.js';

/** 3.0 stars or less scores 0, 4.7 or more scores 100, linear in between. */
export function ratingScore(rating: number): number {
  return clamp(((rating - 3.0) / (4.7 - 3.0)) * 100);
}

/** Log scale, because going from 5 to 50 reviews matters more than 500 to 545. 200 or more scores 100. */
export function volumeScore(count: number): number {
  return clamp((Math.log10(count + 1) / Math.log10(201)) * 100);
}

export function checkReputation(place: Place): CheckResult {
  const base = { id: 'reputation' as const, title: 'Rating and review volume' };
  const count = place.userRatingCount ?? 0;
  const rating = place.rating;

  if (rating === undefined || count === 0) {
    return {
      ...base,
      score: 0,
      status: 'fail',
      summary: 'The listing has no ratings yet.',
      details: [],
      fixes: [{ priority: 'high', text: 'Ask recent customers for a first set of reviews. Do not offer incentives.' }],
    };
  }

  const score = Math.round(0.6 * ratingScore(rating) + 0.4 * volumeScore(count));
  const fixes: Fix[] = [];
  if (rating < 4.0) {
    fixes.push({
      priority: 'high',
      text: `The average rating is ${rating.toFixed(1)}. Read the low ratings, reply to them and fix the complaints that repeat.`,
    });
  }
  if (count < 20) {
    fixes.push({
      priority: 'medium',
      text: `Only ${count} ratings. Build a routine of asking customers for a review after a visit. Do not offer incentives.`,
    });
  }

  return {
    ...base,
    score,
    status: statusFor(score),
    summary: `${rating.toFixed(1)} stars from ${count} ratings.`,
    details: [
      `Rating part: ${Math.round(ratingScore(rating))}/100 (60% of this check)`,
      `Volume part: ${Math.round(volumeScore(count))}/100 (40% of this check)`,
    ],
    fixes,
  };
}
