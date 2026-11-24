import type { FetchLike, Place } from '../src/types.js';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

/** A fetch mock that records calls and answers from a handler. */
export function mockFetch(handler: (call: RecordedCall) => { status?: number; body: unknown } | Error) {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const result = handler(call);
    if (result instanceof Error) throw result;
    const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    return new Response(text, { status: result.status ?? 200 });
  };
  return { fetchImpl, calls };
}

const weekday = (day: number) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } });

/** A complete, healthy listing. Tests override single fields. */
export function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-1',
    displayName: { text: 'Example Shop', languageCode: 'en' },
    formattedAddress: '12 Example Street, Sampletown, ON A1A 1A1, Canada',
    location: { latitude: 45, longitude: -75 },
    googleMapsUri: 'https://maps.google.com/?cid=1',
    businessStatus: 'OPERATIONAL',
    primaryType: 'store',
    types: ['store'],
    nationalPhoneNumber: '(613) 555-0100',
    internationalPhoneNumber: '+1 613-555-0100',
    websiteUri: 'https://shop.example/',
    regularOpeningHours: { periods: [1, 2, 3, 4, 5, 6].map(weekday) },
    rating: 4.7,
    userRatingCount: 200,
    photos: Array.from({ length: 10 }, (_, index) => ({ name: `places/place-1/photos/${index}` })),
    reviews: [{ rating: 5, publishTime: '2026-10-25T00:00:00Z' }],
    editorialSummary: { text: 'A shop.' },
    ...overrides,
  };
}

export function without<K extends keyof Place>(place: Place, ...keys: K[]): Place {
  const copy = { ...place };
  for (const key of keys) delete copy[key];
  return copy;
}
