import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCompetitors, distanceMeters, rankOf, rankScore } from '../src/checks/competitors.js';
import { checkCompleteness } from '../src/checks/completeness.js';
import { checkHours, isAlwaysOpen, periodMinutes } from '../src/checks/hours.js';
import { checkRecency, recencyScore } from '../src/checks/recency.js';
import { checkReputation, ratingScore, volumeScore } from '../src/checks/reputation.js';
import { checkWebsite, compareBusiness, comparisonScore } from '../src/checks/website.js';
import type { HoursPeriod, Place } from '../src/types.js';
import { makePlace, without } from './helpers.js';

const NOW = new Date('2026-11-01T00:00:00Z');
const period = (day: number, oh: number, ch: number, closeDay = day, om = 0, cm = 0): HoursPeriod => ({
  open: { day, hour: oh, minute: om },
  close: { day: closeDay, hour: ch, minute: cm },
});
const withPeriods = (periods: HoursPeriod[]): Place => makePlace({ regularOpeningHours: { periods } });

describe('completeness', () => {
  it('gives 100 to a full listing with no fixes', () => {
    const result = checkCompleteness(makePlace());
    assert.equal(result.score, 100);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.fixes, []);
  });
  it('scores an empty listing 0 and asks for the basics first', () => {
    const result = checkCompleteness({});
    assert.equal(result.score, 0);
    assert.equal(result.status, 'fail');
    assert.deepEqual(result.fixes.map((fix) => fix.priority), ['high', 'high', 'high', 'medium', 'high']);
  });
  it('removes 20 points for a missing phone', () => {
    const result = checkCompleteness(without(makePlace(), 'nationalPhoneNumber', 'internationalPhoneNumber'));
    assert.equal(result.score, 80);
    assert.match(result.fixes[0]!.text, /phone number/);
  });
  it('accepts an international number alone as a phone', () => {
    assert.equal(checkCompleteness(without(makePlace(), 'nationalPhoneNumber')).score, 100);
  });
  it('scales photo points and only flags fewer than five', () => {
    assert.equal(checkCompleteness(makePlace({ photos: [{}, {}, {}, {}, {}] })).score, 90);
    assert.equal(checkCompleteness(makePlace({ photos: [{}, {}, {}, {}, {}] })).fixes.length, 0);
    const few = checkCompleteness(makePlace({ photos: [{}, {}] }));
    assert.equal(few.score, 84);
    assert.equal(few.fixes[0]?.priority, 'medium');
  });
  it('treats hours with no periods as missing', () => {
    assert.equal(checkCompleteness(makePlace({ regularOpeningHours: { periods: [] } })).score, 80);
  });
  it('does not ask the owner to add an editorial summary', () => {
    const result = checkCompleteness(without(makePlace(), 'editorialSummary'));
    assert.equal(result.score, 95);
    assert.deepEqual(result.fixes, []);
  });
  it('zeroes a permanently closed listing and caps a temporarily closed one', () => {
    const closed = checkCompleteness(makePlace({ businessStatus: 'CLOSED_PERMANENTLY' }));
    assert.equal(closed.score, 0);
    assert.equal(closed.fixes[0]?.priority, 'high');
    const paused = checkCompleteness(makePlace({ businessStatus: 'CLOSED_TEMPORARILY' }));
    assert.equal(paused.score, 50);
    assert.equal(paused.status, 'warn');
  });
});

describe('reputation', () => {
  it('maps rating and volume onto 0 to 100', () => {
    assert.equal(ratingScore(2.0), 0);
    assert.equal(ratingScore(3.0), 0);
    assert.equal(ratingScore(5.0), 100);
    assert.equal(Math.round(ratingScore(3.85)), 50);
    assert.equal(volumeScore(0), 0);
    assert.equal(volumeScore(200), 100);
    assert.equal(volumeScore(5000), 100);
    assert.ok(volumeScore(20) > 50 && volumeScore(20) < 65);
  });
  it('fails a listing with no ratings', () => {
    const result = checkReputation(without(makePlace(), 'rating', 'userRatingCount'));
    assert.equal(result.score, 0);
    assert.equal(result.status, 'fail');
    assert.equal(result.fixes.length, 1);
  });
  it('passes a strong listing with no fixes', () => {
    const result = checkReputation(makePlace({ rating: 4.8, userRatingCount: 300 }));
    assert.equal(result.score, 100);
    assert.deepEqual(result.fixes, []);
  });
  it('flags a low rating as high priority and low volume as medium', () => {
    const result = checkReputation(makePlace({ rating: 3.6, userRatingCount: 8 }));
    assert.deepEqual(result.fixes.map((fix) => fix.priority), ['high', 'medium']);
    assert.equal(result.status, 'fail');
  });
  it('a perfect rating from two reviews does not pass', () => {
    const result = checkReputation(makePlace({ rating: 5, userRatingCount: 2 }));
    assert.ok(result.score !== null && result.score < 80);
  });
});

describe('recency', () => {
  it('uses step thresholds', () => {
    assert.deepEqual([0, 30, 31, 90, 91, 180, 181, 365, 366].map(recencyScore), [100, 100, 80, 80, 55, 55, 30, 30, 10]);
  });
  it('uses the newest review in the sample, whatever the order', () => {
    const result = checkRecency(
      makePlace({ reviews: [{ publishTime: '2025-01-01T00:00:00Z' }, { publishTime: '2026-10-22T00:00:00Z' }, { publishTime: '2026-03-01T00:00:00Z' }] }),
      NOW,
    );
    assert.equal(result.score, 100);
    assert.match(result.summary, /10 days old/);
    assert.match(result.details[0]!, /sample of 3 reviews/);
  });
  it('flags an old sample with a hedged fix', () => {
    const result = checkRecency(makePlace({ reviews: [{ publishTime: '2025-01-01T00:00:00Z' }] }), NOW);
    assert.equal(result.score, 10);
    assert.equal(result.status, 'fail');
    assert.match(result.fixes[0]!.text, /in the sample/);
  });
  it('is skipped when there are no reviews or no usable dates', () => {
    assert.equal(checkRecency(without(makePlace(), 'reviews'), NOW).status, 'skipped');
    assert.equal(checkRecency(makePlace({ reviews: [] }), NOW).score, null);
    assert.equal(checkRecency(makePlace({ reviews: [{ rating: 5 }, { publishTime: 'not a date' }] }), NOW).score, null);
  });
  it('never reports a negative age for a review dated after "now"', () => {
    assert.match(checkRecency(makePlace({ reviews: [{ publishTime: '2026-11-02T00:00:00Z' }] }), NOW).summary, /0 days old/);
  });
});

describe('hours', () => {
  it('measures periods, including overnight and Saturday to Sunday wraps', () => {
    assert.equal(periodMinutes(period(1, 9, 17)), 480);
    assert.equal(periodMinutes(period(5, 18, 2, 6)), 480);
    assert.equal(periodMinutes(period(6, 22, 1, 0)), 180);
    assert.equal(periodMinutes(period(2, 0, 0, 3)), 1440);
    assert.equal(periodMinutes({ open: { day: 1, hour: 9, minute: 0 } }), undefined);
  });
  it('recognises the always-open pattern, also when zero values are omitted', () => {
    assert.ok(isAlwaysOpen([{ open: { day: 0, hour: 0, minute: 0 } }]));
    assert.ok(isAlwaysOpen([{ open: {} }]));
    assert.ok(!isAlwaysOpen([{ open: { day: 1, hour: 0, minute: 0 } }]));
    const result = checkHours(withPeriods([{ open: { day: 0, hour: 0, minute: 0 } }]));
    assert.equal(result.score, 100);
    assert.match(result.summary, /24 hours/);
  });
  it('fails when hours are missing', () => {
    const result = checkHours(without(makePlace(), 'regularOpeningHours'));
    assert.equal(result.score, 0);
    assert.equal(result.status, 'fail');
  });
  it('passes normal hours and notes the closed day', () => {
    const result = checkHours(makePlace());
    assert.equal(result.score, 100);
    assert.deepEqual(result.details, ['Shown as closed on: Sunday.']);
    assert.deepEqual(result.fixes, []);
  });
  it('allows two closed days, penalises more', () => {
    assert.equal(checkHours(withPeriods([1, 2, 3, 4, 5].map((day) => period(day, 9, 17)))).score, 100);
    const result = checkHours(withPeriods([1, 2, 3].map((day) => period(day, 9, 17))));
    assert.equal(result.score, 80);
    assert.match(result.fixes[0]!.text, /closed 4 days a week/);
  });
  it('flags a very short opening', () => {
    const result = checkHours(withPeriods([...[1, 2, 3, 4, 5].map((day) => period(day, 9, 17)), period(6, 9, 9, 6, 0, 30)]));
    assert.equal(result.score, 85);
    assert.match(result.details[0]!, /Saturday: open for only 30 minutes/);
  });
  it('flags a very long opening but not a full 24 hour day', () => {
    const long = checkHours(withPeriods([...[1, 2, 3, 4, 5].map((day) => period(day, 9, 17)), period(6, 5, 0, 0, 0, 30)]));
    assert.equal(long.score, 90);
    const fullDay = checkHours(withPeriods([...[1, 2, 3, 4, 5].map((day) => period(day, 9, 17)), period(6, 0, 0, 0)]));
    assert.equal(fullDay.score, 100);
  });
  it('flags a missing closing time outside the always-open pattern', () => {
    const result = checkHours(withPeriods([...[1, 2, 3, 4, 5].map((day) => period(day, 9, 17)), { open: { day: 6, hour: 9, minute: 0 } }]));
    assert.equal(result.score, 80);
    assert.match(result.fixes[0]!.text, /closing time for Saturday/);
  });
  it('notes overnight and split hours without a penalty', () => {
    const result = checkHours(
      withPeriods([...[1, 2, 3, 4].map((day) => period(day, 11, 14)), ...[1, 2, 3, 4].map((day) => period(day, 17, 22)), period(5, 18, 2, 6), period(6, 18, 2, 0)]),
    );
    assert.equal(result.score, 100);
    assert.ok(result.details.some((line) => /Friday: closes after midnight/.test(line)));
    assert.ok(result.details.some((line) => /Split hours.*Monday, Tuesday, Wednesday, Thursday/.test(line)));
    assert.ok(result.details.some((line) => line === 'Shown as closed on: Sunday.'));
  });
});

describe('website consistency', () => {
  const site = (data: object) => ({
    ok: true as const,
    url: 'https://shop.example/',
    html: `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
  });
  const matching = {
    '@type': 'Store',
    name: 'Example Shop',
    telephone: '+1 613 555 0100',
    address: { streetAddress: '12 Example St', addressLocality: 'Sampletown', postalCode: 'A1A 1A1' },
  };

  it('passes when name, address and phone agree after normalisation', () => {
    const result = checkWebsite(makePlace(), site(matching));
    assert.equal(result.score, 100);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.fixes, []);
  });
  it('reports a phone mismatch as a high priority fix and never as a pass', () => {
    const result = checkWebsite(makePlace(), site({ ...matching, telephone: '613-555-0199' }));
    assert.equal(result.score, 67);
    assert.equal(result.status, 'warn');
    assert.match(result.summary, /disagree on: phone/);
    assert.equal(result.fixes[0]?.priority, 'high');
    assert.match(result.fixes[0]!.text, /613-555-0199/);
  });
  it('fails when everything differs', () => {
    const result = checkWebsite(makePlace(), site({ '@type': 'Store', name: 'Other Co', telephone: '613-555-0199', address: '99 Far Road, Elsewhere' }));
    assert.equal(result.score, 0);
    assert.equal(result.status, 'fail');
    assert.equal(result.fixes.length, 3);
  });
  it('gives half credit and a low priority fix for a field missing from the structured data', () => {
    const result = checkWebsite(makePlace(), site({ '@type': 'Store', name: 'Example Shop', address: matching.address }));
    assert.equal(result.score, 83);
    assert.deepEqual(result.fixes.map((fix) => fix.priority), ['low']);
  });
  it('picks the best matching node on a multi-branch page', () => {
    const other = { '@type': 'Store', name: 'Example Shop', telephone: '416-555-0155', address: '500 Other Rd, Bigcity, B2B 2B2' };
    assert.equal(checkWebsite(makePlace(), site([other, matching])).score, 100);
  });
  it('warns when the page has no LocalBusiness data, and counts broken blocks', () => {
    const result = checkWebsite(makePlace(), { ok: true, url: 'https://shop.example/', html: '<script type="application/ld+json">{oops</script>' });
    assert.equal(result.score, 50);
    assert.equal(result.status, 'warn');
    assert.ok(result.details.some((line) => /not valid JSON: 1/.test(line)));
    assert.match(result.fixes[0]!.text, /LocalBusiness JSON-LD/);
  });
  it('fails when the site did not load', () => {
    const result = checkWebsite(makePlace(), { ok: false, url: 'https://shop.example/', reason: 'HTTP 404' });
    assert.equal(result.score, 20);
    assert.equal(result.status, 'fail');
    assert.match(result.summary, /HTTP 404/);
  });
  it('is skipped without a website or when the fetch was skipped', () => {
    assert.equal(checkWebsite(without(makePlace(), 'websiteUri'), undefined).status, 'skipped');
    assert.equal(checkWebsite(makePlace(), undefined).score, null);
  });
  it('compares and scores field by field', () => {
    const comparison = compareBusiness(makePlace(), { types: ['Store'], name: 'Example Shop', telephone: '000' });
    assert.deepEqual(comparison, { name: 'match', address: 'missing', phone: 'mismatch' });
    assert.equal(comparisonScore(comparison), 50);
  });
});

describe('competitor comparison', () => {
  const rival = (id: string, rating: number | undefined, count: number, extra: Partial<Place> = {}): Place => {
    const place: Place = { id, displayName: { text: id }, location: { latitude: 45.001, longitude: -75 }, userRatingCount: count, ...extra };
    if (rating !== undefined) place.rating = rating;
    return place;
  };
  const input = (places: Place[], count = 10) => ({ places, radiusMeters: 2000, count });

  it('ranks with ties sharing the better place', () => {
    assert.equal(rankOf(4.5, [4.8, 4.5, 4.0]), 2);
    assert.equal(rankOf(5, []), 1);
    assert.equal(rankScore(1, 5), 100);
    assert.equal(rankScore(5, 5), 0);
    assert.equal(rankScore(3, 5), 50);
    assert.equal(rankScore(1, 1), 100);
  });
  it('computes a plausible distance', () => {
    const meters = distanceMeters({ latitude: 45, longitude: -75 }, { latitude: 45.001, longitude: -75 });
    assert.ok(meters > 110 && meters < 112);
  });
  it('scores first place 100 and leaves the audited place out of its own comparison', () => {
    const result = checkCompetitors(makePlace(), input([makePlace(), rival('a', 4.0, 50), rival('b', 4.5, 120)]));
    assert.equal(result.score, 100);
    assert.match(result.summary, /Ranks 1 of 3 on rating and 1 of 3 on review count/);
    assert.deepEqual(result.fixes, []);
  });
  it('scores last place 0 and suggests closing the review gap', () => {
    const result = checkCompetitors(makePlace({ rating: 3.5, userRatingCount: 4 }), input([rival('a', 4.0, 50), rival('b', 4.5, 120)]));
    assert.equal(result.score, 0);
    assert.equal(result.status, 'fail');
    assert.equal(result.fixes.length, 1);
  });
  it('mixes the two ranks', () => {
    const result = checkCompetitors(makePlace({ rating: 4.9, userRatingCount: 10 }), input([rival('a', 4.0, 50), rival('b', 4.5, 120)]));
    assert.equal(result.score, 50);
  });
  it('keeps only the nearest N and ignores permanently closed places', () => {
    const result = checkCompetitors(
      makePlace({ rating: 4.0, userRatingCount: 10 }),
      input([rival('gone', 5, 900, { businessStatus: 'CLOSED_PERMANENTLY' }), rival('a', 3.0, 5), rival('far', 5, 900)], 1),
    );
    assert.equal(result.score, 100);
    assert.match(result.details[0]!, /1 nearest/);
  });
  it('treats a competitor with no rating as the lowest', () => {
    const result = checkCompetitors(makePlace({ rating: 3.2, userRatingCount: 1 }), input([rival('new', undefined, 0)]));
    assert.equal(result.score, 100);
    assert.ok(result.details.some((line) => /new: no rating, 0 ratings/.test(line)));
  });
  it('is skipped when turned off, unavailable, or alone', () => {
    assert.equal(checkCompetitors(makePlace(), undefined).status, 'skipped');
    assert.equal(checkCompetitors(makePlace(), { ...input([]), unavailable: 'Nearby search failed: x' }).summary, 'Nearby search failed: x');
    assert.match(checkCompetitors(makePlace(), input([makePlace()])).summary, /No other "store" listings/);
  });
});
