// Normalisation helpers. The goal is to avoid false alarms from formatting
// ("St." against "Street", "+1 604..." against "(604) ...") while still catching real differences.

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Digits only, without extension, international prefix or leading trunk zero. */
export function normalizePhone(phone: string): string {
  return phone
    .replace(/(?:ext\.?|x)\s*\d+\s*$/i, '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
}

/**
 * Two numbers match when one ends with the other and the shorter has at least 7 digits.
 * That lets a national number match its international form.
 */
export function phonesMatch(a: string, b: string): boolean {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 7 && long.endsWith(short);
}

const NAME_NOISE = new Set(['the', 'ltd', 'limited', 'inc', 'incorporated', 'llc', 'co', 'corp', 'company']);

export function nameTokens(name: string): string[] {
  return fold(name)
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !NAME_NOISE.has(token) && token !== 'and');
}

/** Names match when they are equal after cleanup, or one is the other plus extra words. */
export function namesMatch(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const longSet = new Set(long);
  return short.every((token) => longSet.has(token));
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  boulevard: 'blvd',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  square: 'sq',
  highway: 'hwy',
  parkway: 'pkwy',
  terrace: 'ter',
  crescent: 'cres',
  suite: 'ste',
  apartment: 'apt',
  building: 'bldg',
  floor: 'fl',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
};

const ADDRESS_NOISE = new Set(['unit', 'no']);

export function addressTokens(address: string): string[] {
  return fold(address)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !ADDRESS_NOISE.has(token))
    .map((token) => ADDRESS_ABBREVIATIONS[token] ?? token);
}

/**
 * Does the address on the website describe the same place as the listing address?
 * Every token with a digit (street number, unit, postal code) must appear in the listing,
 * and at least 80% of all website tokens must appear. Region and country names vary too
 * much in spelling to demand a full match.
 */
export function addressesMatch(listingAddress: string, siteAddress: string): boolean {
  const listing = new Set(addressTokens(listingAddress));
  const site = addressTokens(siteAddress);
  if (listing.size === 0 || site.length === 0) return false;
  const numeric = site.filter((token) => /\d/.test(token));
  if (!numeric.every((token) => listing.has(token))) return false;
  const found = site.filter((token) => listing.has(token)).length;
  return found / site.length >= 0.8;
}
