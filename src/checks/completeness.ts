import { statusFor } from '../score.js';
import type { CheckResult, Fix, Place } from '../types.js';

/** The API returns at most 10 photos per place, so 10 is the most this check can see. */
export const PHOTO_CAP = 10;

export function checkCompleteness(place: Place): CheckResult {
  const details: string[] = [];
  const fixes: Fix[] = [];
  let score = 0;

  const item = (label: string, points: number, present: boolean, fix?: Fix) => {
    if (present) {
      score += points;
      details.push(`${label}: present`);
    } else {
      details.push(`${label}: missing`);
      if (fix) fixes.push(fix);
    }
  };

  item('Phone number', 20, Boolean(place.nationalPhoneNumber || place.internationalPhoneNumber), {
    priority: 'high',
    text: 'Add a phone number to the listing.',
  });
  item('Website', 20, Boolean(place.websiteUri), {
    priority: 'high',
    text: 'Add a website link to the listing.',
  });
  item('Opening hours', 20, (place.regularOpeningHours?.periods?.length ?? 0) > 0, {
    priority: 'high',
    text: 'Add regular opening hours to the listing.',
  });
  item('Primary category', 15, Boolean(place.primaryType), {
    priority: 'medium',
    text: 'Set a specific primary category for the listing.',
  });

  const photoCount = place.photos?.length ?? 0;
  score += (Math.min(photoCount, PHOTO_CAP) / PHOTO_CAP) * 20;
  details.push(
    photoCount >= PHOTO_CAP
      ? `Photos: ${PHOTO_CAP} or more (the API returns at most ${PHOTO_CAP})`
      : `Photos: ${photoCount}`,
  );
  if (photoCount < 5) {
    fixes.push({
      priority: photoCount === 0 ? 'high' : 'medium',
      text: `Add photos of the exterior, interior and products or team. The listing shows ${photoCount}.`,
    });
  }

  // The editorial summary is written by Google, not by the owner, so it carries little weight and no fix.
  if (place.editorialSummary?.text) {
    score += 5;
    details.push('Editorial summary: present');
  } else {
    details.push('Editorial summary: none (Google writes this, the owner cannot add it directly)');
  }

  score = Math.round(score);
  let summary = `${score} of 100 completeness points.`;

  if (place.businessStatus === 'CLOSED_PERMANENTLY') {
    score = 0;
    summary = 'Google lists this business as permanently closed.';
    fixes.unshift({
      priority: 'high',
      text: 'The listing is marked permanently closed. If the business is open, correct this in the Business Profile first.',
    });
  } else if (place.businessStatus === 'CLOSED_TEMPORARILY') {
    score = Math.min(score, 50);
    summary = 'Google lists this business as temporarily closed.';
    fixes.unshift({
      priority: 'high',
      text: 'The listing is marked temporarily closed. Reopen it in the Business Profile if that is out of date.',
    });
  }
  if (place.businessStatus) details.push(`Business status: ${place.businessStatus}`);

  return { id: 'completeness', title: 'Listing completeness', score, status: statusFor(score), summary, details, fixes };
}
