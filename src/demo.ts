// Demo mode. A stand-in for `fetch` that answers Places API (New) requests and
// website requests from the files in fixtures/. The real client and the real
// pipeline run on top of it, so the demo exercises the same code as a live run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { distanceMeters } from './checks/competitors.js';
import { PLACES_BASE_URL } from './places.js';
import type { FetchLike, LatLng, Place } from './types.js';

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Fixed clock, so the demo report is the same on every run. */
export const DEMO_NOW = new Date('2026-11-01T12:00:00Z');
export const DEMO_API_KEY = 'demo-key-not-real';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code: status, message, status: code } }, status);
}

/** Like the real API: return only the top-level fields named in the mask. */
function applyMask(place: Place, fields: readonly string[]): Record<string, unknown> {
  const top = new Set(fields.map((field) => field.split('.')[0]));
  return Object.fromEntries(Object.entries(place).filter(([key]) => top.has(key)));
}

export function createDemoFetch(dir: string = FIXTURES_DIR): FetchLike {
  const places = JSON.parse(readFileSync(`${dir}/places.json`, 'utf8')) as Place[];
  const sites = JSON.parse(readFileSync(`${dir}/sites/index.json`, 'utf8')) as Record<string, string>;

  return async (input, init) => {
    const url = new URL(input);

    if (!input.startsWith(PLACES_BASE_URL)) {
      const file = sites[url.hostname];
      if (!file) throw new TypeError(`fetch failed (demo: no fixture for ${url.hostname})`);
      return new Response(readFileSync(`${dir}/sites/${file}`, 'utf8'), { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    const headers = new Headers(init?.headers);
    if (!headers.get('X-Goog-Api-Key')) return apiError(403, 'PERMISSION_DENIED', 'Method doesn\'t allow unregistered callers.');
    const mask = headers.get('X-Goog-FieldMask');
    if (!mask) return apiError(400, 'INVALID_ARGUMENT', 'FieldMask is a required parameter.');
    const fields = mask.split(',');
    const path = url.pathname.replace(/^\/v1\//, '');
    const searchFields = fields.map((field) => field.replace(/^places\./, ''));

    if (path === 'places:searchText') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { textQuery?: string; pageSize?: number };
      const query = (body.textQuery ?? '').toLowerCase();
      const found = places.filter((place) => {
        const name = (place.displayName?.text ?? '').toLowerCase();
        return name !== '' && query.includes(name);
      });
      return json(found.length > 0 ? { places: found.slice(0, body.pageSize ?? 20).map((place) => applyMask(place, searchFields)) } : {});
    }

    if (path === 'places:searchNearby') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        includedPrimaryTypes?: string[];
        maxResultCount?: number;
        locationRestriction?: { circle?: { center?: LatLng; radius?: number } };
      };
      const circle = body.locationRestriction?.circle;
      if (!circle?.center || !circle.radius) return apiError(400, 'INVALID_ARGUMENT', 'locationRestriction.circle is required.');
      const center = circle.center;
      const found = places
        .filter((place) => place.location && (body.includedPrimaryTypes ?? []).includes(place.primaryType ?? ''))
        .map((place) => ({ place, distance: distanceMeters(center, place.location!) }))
        .filter((entry) => entry.distance <= circle.radius!)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, body.maxResultCount ?? 20);
      return json(found.length > 0 ? { places: found.map((entry) => applyMask(entry.place, searchFields)) } : {});
    }

    if (path.startsWith('places/') && (init?.method ?? 'GET') === 'GET') {
      const id = decodeURIComponent(path.slice('places/'.length));
      const place = places.find((candidate) => candidate.id === id);
      if (!place) return apiError(404, 'NOT_FOUND', `Place ID ${id} not found in the demo fixtures.`);
      return json(applyMask(place, fields));
    }

    return apiError(404, 'NOT_FOUND', 'Unknown demo endpoint.');
  };
}
