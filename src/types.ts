// Shapes of the Places API (New) fields this tool reads. Every field is optional,
// because the API omits anything that is not in the field mask or not known.

export interface LocalizedText {
  text?: string;
  languageCode?: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface HoursPoint {
  day?: number; // 0 = Sunday ... 6 = Saturday
  hour?: number;
  minute?: number;
}

export interface HoursPeriod {
  open?: HoursPoint;
  close?: HoursPoint;
}

export interface OpeningHours {
  openNow?: boolean;
  periods?: HoursPeriod[];
  weekdayDescriptions?: string[];
}

export interface Review {
  name?: string;
  rating?: number;
  publishTime?: string; // RFC 3339
  relativePublishTimeDescription?: string;
}

export interface Photo {
  name?: string;
  widthPx?: number;
  heightPx?: number;
}

export interface Place {
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  location?: LatLng;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryType?: string;
  primaryTypeDisplayName?: LocalizedText;
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: OpeningHours;
  rating?: number;
  userRatingCount?: number;
  photos?: Photo[];
  reviews?: Review[];
  editorialSummary?: LocalizedText;
}

// Audit model

export type Status = 'pass' | 'warn' | 'fail' | 'skipped';
export type Priority = 'high' | 'medium' | 'low';
export type CheckId = 'completeness' | 'reputation' | 'recency' | 'hours' | 'website' | 'competitors';

export interface Fix {
  priority: Priority;
  text: string;
}

export interface CheckResult {
  id: CheckId;
  title: string;
  /** 0 to 100, or null when the check could not run. */
  score: number | null;
  status: Status;
  summary: string;
  details: string[];
  fixes: Fix[];
}

export interface PrioritisedFix extends Fix {
  check: CheckId;
}

export interface LocationInput {
  label?: string;
  placeId?: string;
  query?: string;
}

export interface LocationAudit {
  label: string;
  input: LocationInput;
  placeId?: string;
  name?: string;
  address?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  score: number | null;
  status: Status;
  checks: CheckResult[];
  fixes: PrioritisedFix[];
  /** Set when the location could not be audited at all. */
  error?: string;
}

export interface RunReport {
  tool: string;
  version: string;
  generatedAt: string;
  demo: boolean;
  options: {
    radiusMeters: number;
    competitorCount: number;
    skip: string[];
  };
  locations: LocationAudit[];
}

/** Outcome of fetching the listing's website. */
export type SiteFetch =
  | { ok: true; url: string; html: string }
  | { ok: false; url: string; reason: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
