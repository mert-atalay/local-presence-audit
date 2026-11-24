import { parseJsonLd, type SiteBusiness } from '../jsonld.js';
import { addressesMatch, namesMatch, phonesMatch } from '../normalize.js';
import { statusFor } from '../score.js';
import type { CheckResult, Fix, Place, SiteFetch } from '../types.js';

export type FieldVerdict = 'match' | 'mismatch' | 'missing';

export interface Comparison {
  name: FieldVerdict;
  address: FieldVerdict;
  phone: FieldVerdict;
}

function verdict(listing: string | undefined, site: string | undefined, same: (a: string, b: string) => boolean): FieldVerdict {
  if (!site || !listing) return 'missing';
  return same(listing, site) ? 'match' : 'mismatch';
}

export function compareBusiness(place: Place, site: SiteBusiness): Comparison {
  const listingPhone = place.internationalPhoneNumber ?? place.nationalPhoneNumber;
  return {
    name: verdict(place.displayName?.text, site.name, namesMatch),
    address: verdict(place.formattedAddress, site.address, addressesMatch),
    phone: verdict(listingPhone, site.telephone, phonesMatch),
  };
}

const POINTS: Record<FieldVerdict, number> = { match: 1, missing: 0.5, mismatch: 0 };

export function comparisonScore(comparison: Comparison): number {
  return Math.round(((POINTS[comparison.name] + POINTS[comparison.address] + POINTS[comparison.phone]) / 3) * 100);
}

/**
 * Pure: takes the already-fetched page. `site` is undefined when the fetch was skipped.
 */
export function checkWebsite(place: Place, site: SiteFetch | undefined): CheckResult {
  const base = { id: 'website' as const, title: 'Website consistency' };
  const skipped = (summary: string): CheckResult => ({ ...base, score: null, status: 'skipped', summary, details: [], fixes: [] });

  if (!place.websiteUri) return skipped('The listing has no website, so there is nothing to compare.');
  if (!site) return skipped('The website check was skipped.');

  if (!site.ok) {
    return {
      ...base,
      score: 20,
      status: 'fail',
      summary: `The website on the listing did not load (${site.reason}).`,
      details: [`URL: ${site.url}`],
      fixes: [{ priority: 'high', text: 'The website link on the listing did not load. Check the URL and the site.' }],
    };
  }

  const parsed = parseJsonLd(site.html);
  if (parsed.businesses.length === 0) {
    const details = [`JSON-LD blocks found: ${parsed.blocks}`];
    if (parsed.invalidBlocks > 0) details.push(`JSON-LD blocks that are not valid JSON: ${parsed.invalidBlocks}`);
    return {
      ...base,
      score: 50,
      status: statusFor(50),
      summary: 'The page loaded but has no schema.org LocalBusiness data to compare.',
      details,
      fixes: [
        {
          priority: 'medium',
          text: 'Add schema.org LocalBusiness JSON-LD to the site with the same name, address and phone as the listing.',
        },
      ],
    };
  }

  // A page can describe several branches. Use the node that agrees best with the listing.
  const best = parsed.businesses
    .map((business) => ({ business, comparison: compareBusiness(place, business) }))
    .sort((a, b) => comparisonScore(b.comparison) - comparisonScore(a.comparison))[0]!;
  const { business, comparison } = best;

  const listingValues = {
    name: place.displayName?.text,
    address: place.formattedAddress,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
  };
  const siteValues = { name: business.name, address: business.address, phone: business.telephone };

  const details: string[] = [`Structured data type: ${business.types.join(', ') || 'unknown'}`];
  const fixes: Fix[] = [];
  for (const field of ['name', 'address', 'phone'] as const) {
    const result = comparison[field];
    const listing = listingValues[field] ?? 'not on listing';
    const onSite = siteValues[field] ?? 'not in structured data';
    details.push(`${field[0]!.toUpperCase()}${field.slice(1)}: ${result} (listing: ${listing} | site: ${onSite})`);
    if (result === 'mismatch') {
      fixes.push({
        priority: 'high',
        text: `The ${field} differs between the listing ("${listing}") and the website ("${onSite}"). Make them the same.`,
      });
    } else if (result === 'missing' && listingValues[field]) {
      fixes.push({ priority: 'low', text: `Add the ${field} to the LocalBusiness structured data on the website.` });
    }
  }

  const score = comparisonScore(comparison);
  const mismatched = (['name', 'address', 'phone'] as const).filter((field) => comparison[field] === 'mismatch');
  const mismatches = mismatched.length;
  return {
    ...base,
    score,
    // Any mismatch is a real inconsistency, so it never shows as a pass.
    status: mismatches > 0 && statusFor(score) === 'pass' ? 'warn' : statusFor(score),
    summary:
      mismatches === 0
        ? 'Name, address and phone in the site structured data agree with the listing.'
        : `The site structured data and the listing disagree on: ${mismatched.join(', ')}.`,
    details,
    fixes,
  };
}
