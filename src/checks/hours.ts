import { clamp, statusFor } from '../score.js';
import type { CheckResult, Fix, HoursPeriod, HoursPoint, Place } from '../types.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEK_MINUTES = 7 * 24 * 60;

function weekMinute(point: HoursPoint): number {
  return (point.day ?? 0) * 24 * 60 + (point.hour ?? 0) * 60 + (point.minute ?? 0);
}

function clock(point: HoursPoint): string {
  return `${String(point.hour ?? 0).padStart(2, '0')}:${String(point.minute ?? 0).padStart(2, '0')}`;
}

/** The documented way the API says "always open": one period opening Sunday 00:00 with no close. */
export function isAlwaysOpen(periods: readonly HoursPeriod[]): boolean {
  const only = periods[0];
  return (
    periods.length === 1 &&
    only !== undefined &&
    only.close === undefined &&
    (only.open?.day ?? 0) === 0 &&
    (only.open?.hour ?? 0) === 0 &&
    (only.open?.minute ?? 0) === 0
  );
}

/** Length in minutes. Handles periods that run past midnight or wrap from Saturday to Sunday. */
export function periodMinutes(period: HoursPeriod): number | undefined {
  if (!period.open || !period.close) return undefined;
  const length = (weekMinute(period.close) - weekMinute(period.open) + WEEK_MINUTES) % WEEK_MINUTES;
  return length === 0 ? WEEK_MINUTES : length;
}

export function checkHours(place: Place): CheckResult {
  const base = { id: 'hours' as const, title: 'Hours sanity' };
  const periods = place.regularOpeningHours?.periods ?? [];

  if (periods.length === 0) {
    return {
      ...base,
      score: 0,
      status: 'fail',
      summary: 'No regular opening hours on the listing.',
      details: [],
      // The completeness check already carries the "add hours" fix, so it is not repeated here.
      fixes: [],
    };
  }

  if (isAlwaysOpen(periods)) {
    return {
      ...base,
      score: 100,
      status: 'pass',
      summary: 'Listed as open 24 hours, every day.',
      details: ['Confirm this is correct. A 24 hour listing is sometimes a placeholder.'],
      fixes: [],
    };
  }

  const details: string[] = [];
  const fixes: Fix[] = [];
  let penalty = 0;

  const openDays = new Set<number>();
  for (const period of periods) {
    if (!period.open) continue;
    const day = period.open.day ?? 0;
    const dayName = DAYS[day] ?? `day ${day}`;
    openDays.add(day);
    const minutes = periodMinutes(period);

    if (minutes === undefined) {
      penalty += 20;
      details.push(`${dayName}: opens at ${clock(period.open)} with no closing time.`);
      fixes.push({ priority: 'medium', text: `Add a closing time for ${dayName}.` });
    } else if (minutes < 60) {
      penalty += 15;
      details.push(`${dayName}: open for only ${minutes} minutes (${clock(period.open)} to ${clock(period.close ?? {})}).`);
      fixes.push({ priority: 'medium', text: `Check the ${dayName} hours. A ${minutes} minute opening looks like a typing error.` });
    } else if (minutes > 18 * 60 && minutes !== 24 * 60) {
      penalty += 10;
      details.push(`${dayName}: open for ${(minutes / 60).toFixed(1)} hours in one stretch.`);
      fixes.push({ priority: 'low', text: `Check the ${dayName} hours. A very long opening may be an AM/PM mix-up.` });
    } else if ((period.close?.day ?? day) !== day && minutes !== 24 * 60) {
      details.push(`${dayName}: closes after midnight (${clock(period.open)} to ${clock(period.close ?? {})}). Fine if intended.`);
    }
  }

  const closedDays = DAYS.filter((_, day) => !openDays.has(day));
  if (closedDays.length > 0) {
    details.push(`Shown as closed on: ${closedDays.join(', ')}.`);
    if (closedDays.length > 2) {
      penalty += 10 * (closedDays.length - 2);
      fixes.push({
        priority: 'medium',
        text: `The listing shows the business closed ${closedDays.length} days a week. Confirm no days are missing.`,
      });
    }
  }

  const splitDays = DAYS.filter((_, day) => periods.filter((period) => (period.open?.day ?? 0) === day).length > 1);
  if (splitDays.length > 0) details.push(`Split hours (more than one opening) on: ${splitDays.join(', ')}.`);

  const score = clamp(100 - penalty);
  return {
    ...base,
    score,
    status: statusFor(score),
    summary:
      penalty === 0
        ? `Hours listed for ${openDays.size} of 7 days, nothing unusual.`
        : `Hours listed for ${openDays.size} of 7 days, with points to check.`,
    details,
    fixes,
  };
}
