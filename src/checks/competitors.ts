import { statusFor } from '../score.js';
import type { CheckResult, LatLng, Place } from '../types.js';

export interface CompetitorInput {
  /** Nearby places of the same primary type, nearest first. May include the audited place itself. */
  places: Place[];
  radiusMeters: number;
  count: number;
  /** Set when the nearby search failed or could not be made. */
  unavailable?: string;
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** 1 is best. Ties share the better rank. */
export function rankOf(own: number, others: readonly number[]): number {
  return 1 + others.filter((value) => value > own).length;
}

/** 100 for first place, 0 for last. */
export function rankScore(rank: number, total: number): number {
  return total <= 1 ? 100 : ((total - rank) / (total - 1)) * 100;
}

export function checkCompetitors(place: Place, input: CompetitorInput | undefined): CheckResult {
  const base = { id: 'competitors' as const, title: 'Competitor comparison' };
  const skipped = (summary: string): CheckResult => ({ ...base, score: null, status: 'skipped', summary, details: [], fixes: [] });

  if (!input) return skipped('The competitor comparison was skipped.');
  if (input.unavailable) return skipped(input.unavailable);

  const competitors = input.places
    .filter((other) => other.id !== place.id && other.businessStatus !== 'CLOSED_PERMANENTLY')
    .slice(0, input.count);
  if (competitors.length === 0) {
    return skipped(`No other "${place.primaryType}" listings found within ${input.radiusMeters} m.`);
  }

  const total = competitors.length + 1;
  const ratingRank = rankOf(place.rating ?? 0, competitors.map((other) => other.rating ?? 0));
  const countRank = rankOf(place.userRatingCount ?? 0, competitors.map((other) => other.userRatingCount ?? 0));
  const score = Math.round((rankScore(ratingRank, total) + rankScore(countRank, total)) / 2);

  const details = [
    `Compared with the ${competitors.length} nearest "${place.primaryType}" listings within ${input.radiusMeters} m.`,
    `Rating rank: ${ratingRank} of ${total}`,
    `Review count rank: ${countRank} of ${total}`,
    ...competitors.map((other) => {
      const distance = place.location && other.location ? `, ${Math.round(distanceMeters(place.location, other.location))} m away` : '';
      const rating = other.rating === undefined ? 'no rating' : `${other.rating.toFixed(1)} stars`;
      return `${other.displayName?.text ?? other.id ?? 'Unnamed'}: ${rating}, ${other.userRatingCount ?? 0} ratings${distance}`;
    }),
  ];

  const half = total / 2;
  return {
    ...base,
    score,
    status: statusFor(score),
    summary: `Ranks ${ratingRank} of ${total} on rating and ${countRank} of ${total} on review count among nearby listings of the same type.`,
    details,
    fixes:
      countRank > half
        ? [
            {
              priority: 'medium',
              text: `Nearby listings of the same type have more reviews (rank ${countRank} of ${total}). Review count is the gap to close.`,
            },
          ]
        : [],
  };
}
