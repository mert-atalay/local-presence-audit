import type { FetchLike, LatLng, Place } from './types.js';

export const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

// Field names as documented for the Place resource in the Places API (New).
// The mask decides the billing tier, so each list is kept as short as possible.
export const DETAILS_FIELDS_BASE = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'googleMapsUri',
  'businessStatus',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'photos',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'rating',
  'userRatingCount',
] as const;

/** These two move a Place Details request up to the highest billing tier. */
export const DETAILS_FIELDS_ATMOSPHERE = ['reviews', 'editorialSummary'] as const;

/** Text Search is only used to turn a query into a place id. */
export const SEARCH_ID_FIELDS = ['id'] as const;

export const COMPETITOR_FIELDS = ['id', 'displayName', 'location', 'businessStatus', 'rating', 'userRatingCount'] as const;

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;

/**
 * Build the value of the X-Goog-FieldMask header.
 * Place Details takes bare names ("id,displayName").
 * The search methods take the same names under "places." ("places.id,places.displayName").
 */
export function buildFieldMask(fields: readonly string[], prefix = ''): string {
  const unique = [...new Set(fields)];
  if (unique.length === 0) throw new Error('A field mask needs at least one field.');
  for (const field of unique) {
    if (!FIELD_NAME.test(field)) throw new Error(`Invalid field name in field mask: "${field}"`);
  }
  return unique.map((field) => (prefix ? `${prefix}.${field}` : field)).join(',');
}

export function detailsFields(includeReviews: boolean): string[] {
  return includeReviews ? [...DETAILS_FIELDS_BASE, ...DETAILS_FIELDS_ATMOSPHERE] : [...DETAILS_FIELDS_BASE];
}

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

export interface PlacesClientOptions {
  languageCode?: string;
  regionCode?: string;
}

export interface NearbyRequest {
  center: LatLng;
  radiusMeters: number;
  primaryType: string;
  maxResultCount: number;
}

export class PlacesClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly options: PlacesClientOptions = {},
  ) {
    if (!apiKey) throw new Error('A Google Maps API key is required.');
  }

  /** Place Details (New): GET /v1/places/{placeId} */
  async getPlace(placeId: string, fields: readonly string[]): Promise<Place> {
    const url = new URL(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`);
    if (this.options.languageCode) url.searchParams.set('languageCode', this.options.languageCode);
    if (this.options.regionCode) url.searchParams.set('regionCode', this.options.regionCode);
    return (await this.request(url.toString(), buildFieldMask(fields))) as Place;
  }

  /** Text Search (New): POST /v1/places:searchText. Returns the id of the top result, if any. */
  async findPlaceId(textQuery: string): Promise<string | undefined> {
    const body = { textQuery, pageSize: 1, ...this.localeParams() };
    const data = (await this.request(`${PLACES_BASE_URL}/places:searchText`, buildFieldMask(SEARCH_ID_FIELDS, 'places'), body)) as {
      places?: Place[];
    };
    return data.places?.[0]?.id;
  }

  /** Nearby Search (New): POST /v1/places:searchNearby, nearest first. */
  async searchNearby(request: NearbyRequest): Promise<Place[]> {
    const body = {
      includedPrimaryTypes: [request.primaryType],
      maxResultCount: Math.min(20, Math.max(1, request.maxResultCount)),
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: request.center.latitude, longitude: request.center.longitude },
          radius: Math.min(50000, Math.max(1, request.radiusMeters)),
        },
      },
      ...this.localeParams(),
    };
    const data = (await this.request(`${PLACES_BASE_URL}/places:searchNearby`, buildFieldMask(COMPETITOR_FIELDS, 'places'), body)) as {
      places?: Place[];
    };
    return data.places ?? [];
  }

  private localeParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.options.languageCode) params.languageCode = this.options.languageCode;
    if (this.options.regionCode) params.regionCode = this.options.regionCode;
    return params;
  }

  private async request(url: string, fieldMask: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new PlacesApiError(`Places API returned a non-JSON response (HTTP ${response.status}).`, response.status);
    }
    if (!response.ok) {
      const error = (data as { error?: { message?: string; status?: string } }).error;
      const detail = [error?.status, error?.message].filter(Boolean).join(': ') || 'no error detail';
      throw new PlacesApiError(`Places API error (HTTP ${response.status}): ${detail}`, response.status);
    }
    return data;
  }
}
