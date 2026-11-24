import { checkCompetitors, type CompetitorInput } from './checks/competitors.js';
import { checkCompleteness } from './checks/completeness.js';
import { checkHours } from './checks/hours.js';
import { checkRecency } from './checks/recency.js';
import { checkReputation } from './checks/reputation.js';
import { checkWebsite } from './checks/website.js';
import { detailsFields, type PlacesClient } from './places.js';
import { overallScore, prioritiseFixes, statusFor } from './score.js';
import type { FetchLike, LocationAudit, LocationInput, Place, RunReport, SiteFetch } from './types.js';
import { TOOL_NAME, VERSION } from './version.js';

export type Skippable = 'reviews' | 'website' | 'competitors';
export const SKIPPABLE: readonly Skippable[] = ['reviews', 'website', 'competitors'];

export interface AuditOptions {
  radiusMeters: number;
  competitorCount: number;
  skip: ReadonlySet<Skippable>;
  now: Date;
  /** Used for the business website only. The Places client carries its own fetch. */
  siteFetch: FetchLike;
  demo?: boolean;
}

const MAX_HTML_CHARS = 2_000_000;

export async function fetchSite(url: string, fetchImpl: FetchLike, timeoutMs = 10_000): Promise<SiteFetch> {
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': `${TOOL_NAME}/${VERSION}`, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) return { ok: false, url, reason: `HTTP ${response.status}` };
    return { ok: true, url, html: (await response.text()).slice(0, MAX_HTML_CHARS) };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'request failed';
    return { ok: false, url, reason };
  }
}

async function loadCompetitors(place: Place, client: PlacesClient, options: AuditOptions): Promise<CompetitorInput> {
  const input = { places: [], radiusMeters: options.radiusMeters, count: options.competitorCount };
  if (!place.primaryType) return { ...input, unavailable: 'The listing has no primary type, so there is nothing to compare against.' };
  if (!place.location) return { ...input, unavailable: 'The listing has no coordinates, so nearby listings could not be searched.' };
  try {
    const places = await client.searchNearby({
      center: place.location,
      radiusMeters: options.radiusMeters,
      primaryType: place.primaryType,
      // One extra, because the audited place is usually in its own results.
      maxResultCount: options.competitorCount + 1,
    });
    return { ...input, places };
  } catch (error) {
    // For example a primary type that Nearby Search does not accept as a filter.
    return { ...input, unavailable: `Nearby search failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Run every check on one place that has already been fetched. */
export async function auditPlace(place: Place, input: LocationInput, client: PlacesClient, options: AuditOptions): Promise<LocationAudit> {
  const site = place.websiteUri && !options.skip.has('website') ? await fetchSite(place.websiteUri, options.siteFetch) : undefined;
  const competitors = options.skip.has('competitors') ? undefined : await loadCompetitors(place, client, options);

  const checks = [
    checkCompleteness(place),
    checkReputation(place),
    checkRecency(place, options.now),
    checkHours(place),
    checkWebsite(place, site),
    checkCompetitors(place, competitors),
  ];
  const score = overallScore(checks);

  const audit: LocationAudit = {
    label: input.label ?? place.displayName?.text ?? place.id ?? 'Unknown',
    input,
    score,
    status: statusFor(score),
    checks,
    fixes: prioritiseFixes(checks),
  };
  if (place.id) audit.placeId = place.id;
  if (place.displayName?.text) audit.name = place.displayName.text;
  if (place.formattedAddress) audit.address = place.formattedAddress;
  if (place.googleMapsUri) audit.googleMapsUri = place.googleMapsUri;
  if (place.websiteUri) audit.websiteUri = place.websiteUri;
  return audit;
}

/** Resolve the input to a place, then audit it. Never throws: failures become an entry with `error`. */
export async function auditLocation(input: LocationInput, client: PlacesClient, options: AuditOptions): Promise<LocationAudit> {
  const failed = (error: string): LocationAudit => ({
    label: input.label ?? input.query ?? input.placeId ?? 'Unknown',
    input,
    score: null,
    status: 'skipped',
    checks: [],
    fixes: [],
    error,
  });

  try {
    let placeId = input.placeId;
    if (!placeId) {
      if (!input.query) return failed('No place id or query given.');
      placeId = await client.findPlaceId(input.query);
      if (!placeId) return failed(`Text Search found no place for "${input.query}".`);
    }
    const place = await client.getPlace(placeId, detailsFields(!options.skip.has('reviews')));
    return await auditPlace(place, input, client, options);
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}

/** Audit all locations one after another. Lowest score first, failed lookups last. */
export async function runAudit(inputs: readonly LocationInput[], client: PlacesClient, options: AuditOptions): Promise<RunReport> {
  const locations: LocationAudit[] = [];
  for (const input of inputs) locations.push(await auditLocation(input, client, options));
  locations.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));

  return {
    tool: TOOL_NAME,
    version: VERSION,
    generatedAt: options.now.toISOString(),
    demo: options.demo ?? false,
    options: {
      radiusMeters: options.radiusMeters,
      competitorCount: options.competitorCount,
      skip: [...options.skip].sort(),
    },
    locations,
  };
}
