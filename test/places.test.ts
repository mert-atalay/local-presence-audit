import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFieldMask, detailsFields, PlacesApiError, PlacesClient } from '../src/places.js';
import { mockFetch } from './helpers.js';

describe('buildFieldMask', () => {
  it('joins bare names with commas and no spaces', () => {
    assert.equal(buildFieldMask(['id', 'displayName']), 'id,displayName');
  });
  it('adds the places. prefix for search methods', () => {
    assert.equal(buildFieldMask(['id', 'rating'], 'places'), 'places.id,places.rating');
  });
  it('removes duplicates', () => {
    assert.equal(buildFieldMask(['id', 'id', 'rating']), 'id,rating');
  });
  it('rejects an empty mask and invalid names', () => {
    assert.throws(() => buildFieldMask([]), /at least one field/);
    assert.throws(() => buildFieldMask(['display name']), /Invalid field name/);
    assert.throws(() => buildFieldMask(['*']), /Invalid field name/);
  });
});

describe('detailsFields', () => {
  it('leaves out the Atmosphere tier fields when reviews are skipped', () => {
    const lean = detailsFields(false);
    assert.ok(!lean.includes('reviews'));
    assert.ok(!lean.includes('editorialSummary'));
    assert.ok(lean.includes('regularOpeningHours'));
    const full = detailsFields(true);
    assert.ok(full.includes('reviews') && full.includes('editorialSummary'));
  });
});

describe('PlacesClient', () => {
  it('Place Details: GET with key and field mask in headers, never in the URL', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ body: { id: 'abc' } }));
    const place = await new PlacesClient('secret-key', fetchImpl, { languageCode: 'en' }).getPlace('abc', ['id', 'rating']);
    assert.equal(place.id, 'abc');
    const call = calls[0]!;
    assert.equal(call.method, 'GET');
    assert.equal(call.url, 'https://places.googleapis.com/v1/places/abc?languageCode=en');
    assert.equal(call.headers.get('X-Goog-Api-Key'), 'secret-key');
    assert.equal(call.headers.get('X-Goog-FieldMask'), 'id,rating');
    assert.ok(!call.url.includes('secret-key'));
  });

  it('Text Search: POST asking only for places.id, returns the first id', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ body: { places: [{ id: 'first' }, { id: 'second' }] } }));
    const id = await new PlacesClient('k', fetchImpl).findPlaceId('Example Shop, Sampletown');
    assert.equal(id, 'first');
    const call = calls[0]!;
    assert.equal(call.method, 'POST');
    assert.equal(call.url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(call.headers.get('X-Goog-FieldMask'), 'places.id');
    assert.deepEqual(call.body, { textQuery: 'Example Shop, Sampletown', pageSize: 1 });
  });

  it('Text Search: an empty response means no match', async () => {
    const { fetchImpl } = mockFetch(() => ({ body: {} }));
    assert.equal(await new PlacesClient('k', fetchImpl).findPlaceId('nothing'), undefined);
  });

  it('Nearby Search: primary type filter, distance ranking, clamped limits', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ body: {} }));
    const places = await new PlacesClient('k', fetchImpl).searchNearby({
      center: { latitude: 1, longitude: 2 },
      radiusMeters: 90000,
      primaryType: 'bakery',
      maxResultCount: 50,
    });
    assert.deepEqual(places, []);
    const call = calls[0]!;
    assert.equal(call.url, 'https://places.googleapis.com/v1/places:searchNearby');
    assert.equal(call.headers.get('X-Goog-FieldMask'), 'places.id,places.displayName,places.location,places.businessStatus,places.rating,places.userRatingCount');
    assert.deepEqual(call.body, {
      includedPrimaryTypes: ['bakery'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: 1, longitude: 2 }, radius: 50000 } },
    });
  });

  it('turns an API error body into a PlacesApiError', async () => {
    const { fetchImpl } = mockFetch(() => ({
      status: 403,
      body: { error: { code: 403, message: 'API key not valid.', status: 'PERMISSION_DENIED' } },
    }));
    await assert.rejects(new PlacesClient('k', fetchImpl).getPlace('abc', ['id']), (error: unknown) => {
      assert.ok(error instanceof PlacesApiError);
      assert.equal(error.httpStatus, 403);
      assert.match(error.message, /PERMISSION_DENIED: API key not valid\./);
      return true;
    });
  });

  it('handles a non-JSON error page', async () => {
    const { fetchImpl } = mockFetch(() => ({ status: 502, body: '<html>Bad gateway</html>' }));
    await assert.rejects(new PlacesClient('k', fetchImpl).getPlace('abc', ['id']), /non-JSON response \(HTTP 502\)/);
  });

  it('refuses to start without a key', () => {
    assert.throws(() => new PlacesClient(''), /API key is required/);
  });
});
