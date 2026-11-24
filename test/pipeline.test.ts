import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditLocation, fetchSite, runAudit, type AuditOptions, type Skippable } from '../src/audit.js';
import { createDemoFetch, DEMO_API_KEY, DEMO_NOW, FIXTURES_DIR } from '../src/demo.js';
import { parseLocationsCsv } from '../src/input.js';
import { PlacesClient } from '../src/places.js';
import { escapeHtml, renderHtml } from '../src/report/html.js';
import { renderMarkdown } from '../src/report/markdown.js';
import type { FetchLike, RunReport } from '../src/types.js';
import { makePlace, mockFetch } from './helpers.js';

const example = (name: string) => readFileSync(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)), 'utf8');

function demoSetup(skip: Skippable[] = []) {
  const calls: { url: string; mask: string | null }[] = [];
  const demoFetch = createDemoFetch();
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, mask: new Headers(init?.headers).get('X-Goog-FieldMask') });
    return demoFetch(url, init);
  };
  const options: AuditOptions = { radiusMeters: 2000, competitorCount: 10, skip: new Set(skip), now: DEMO_NOW, siteFetch: fetchImpl, demo: true };
  return { calls, options, client: new PlacesClient(DEMO_API_KEY, fetchImpl) };
}

async function demoReport(skip: Skippable[] = []): Promise<{ report: RunReport; calls: { url: string; mask: string | null }[] }> {
  const { calls, options, client } = demoSetup(skip);
  const inputs = parseLocationsCsv(readFileSync(`${FIXTURES_DIR}/locations.csv`, 'utf8'));
  return { report: await runAudit(inputs, client, options), calls };
}

describe('demo pipeline', () => {
  it('audits all fixture locations and sorts them lowest score first', async () => {
    const { report } = await demoReport();
    assert.deepEqual(report.locations.map((location) => location.name), ['Tidewater Bike Repair', 'Corner Loaf Bakery', 'Brightside Dental Studio']);
    const scores = report.locations.map((location) => location.score ?? -1);
    assert.deepEqual(scores, [...scores].sort((a, b) => a - b));
    assert.ok(report.locations.every((location) => location.checks.length === 6 && !location.error));
  });

  it('resolves name and city rows through Text Search, asking only for the id', async () => {
    const { calls } = await demoReport();
    const searches = calls.filter((call) => call.url.endsWith('places:searchText'));
    assert.equal(searches.length, 2);
    assert.ok(searches.every((call) => call.mask === 'places.id'));
  });

  it('matches the committed Markdown and JSON examples (regenerate with: npm run demo -- --out examples)', async () => {
    const { report } = await demoReport();
    assert.equal(renderMarkdown(report), example('demo-report.md'));
    assert.deepEqual(JSON.parse(JSON.stringify(report)), JSON.parse(example('demo-report.json')));
  });

  it('matches the committed HTML example', async () => {
    const { report } = await demoReport();
    assert.equal(renderHtml(report), example('demo-report.html'));
  });

  it('--skip reviews keeps the Atmosphere fields out of the field mask and skips recency', async () => {
    const { report, calls } = await demoReport(['reviews']);
    const details = calls.filter((call) => /\/places\/DEMO_/.test(call.url));
    assert.equal(details.length, 3);
    assert.ok(details.every((call) => call.mask && !call.mask.includes('reviews') && !call.mask.includes('editorialSummary')));
    assert.ok(report.locations.every((location) => location.checks.find((check) => check.id === 'recency')?.status === 'skipped'));
  });

  it('--skip website and competitors makes no site or nearby requests', async () => {
    const { report, calls } = await demoReport(['website', 'competitors']);
    assert.ok(calls.every((call) => call.url.startsWith('https://places.googleapis.com/') && !call.url.endsWith(':searchNearby')));
    for (const location of report.locations) {
      assert.equal(location.checks.find((check) => check.id === 'competitors')?.status, 'skipped');
      assert.equal(location.checks.find((check) => check.id === 'website')?.status, 'skipped');
    }
  });

  it('the demo fetch behaves like the API: mask required, only masked fields returned', async () => {
    const demoFetch = createDemoFetch();
    const noMask = await demoFetch('https://places.googleapis.com/v1/places/DEMO_corner_loaf', { headers: { 'X-Goog-Api-Key': 'k' } });
    assert.equal(noMask.status, 400);
    const masked = await demoFetch('https://places.googleapis.com/v1/places/DEMO_corner_loaf', {
      headers: { 'X-Goog-Api-Key': 'k', 'X-Goog-FieldMask': 'id,rating' },
    });
    assert.deepEqual(await masked.json(), { id: 'DEMO_corner_loaf', rating: 4.3 });
  });
});

describe('failures on single locations', () => {
  it('reports an unknown place id as an error entry instead of throwing', async () => {
    const { client, options } = demoSetup();
    const audit = await auditLocation({ placeId: 'does-not-exist' }, client, options);
    assert.match(audit.error ?? '', /HTTP 404/);
    assert.equal(audit.score, null);
  });
  it('reports a query with no result', async () => {
    const { client, options } = demoSetup();
    const audit = await auditLocation({ query: 'No Such Business, Nowhere' }, client, options);
    assert.match(audit.error ?? '', /found no place/);
  });
  it('puts failed locations last and renders them in every format', async () => {
    const { client, options } = demoSetup();
    const report = await runAudit([{ placeId: 'does-not-exist', label: 'Ghost' }, { placeId: 'DEMO_corner_loaf' }], client, options);
    assert.deepEqual(report.locations.map((location) => location.label), ['Corner Loaf Bakery', 'Ghost']);
    assert.match(renderMarkdown(report), /Could not audit this location/);
    assert.match(renderHtml(report), /Could not audit this location/);
  });
  it('keeps going when the nearby search is rejected', async () => {
    const place = makePlace();
    const { fetchImpl } = mockFetch((call) => {
      if (call.url.endsWith(':searchNearby')) return { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Unsupported type' } } };
      if (call.url.includes('/v1/places/')) return { body: place };
      return { body: '<html></html>' };
    });
    const audit = await auditLocation(
      { placeId: 'place-1' },
      new PlacesClient('k', fetchImpl),
      { radiusMeters: 500, competitorCount: 5, skip: new Set(), now: DEMO_NOW, siteFetch: fetchImpl },
    );
    assert.equal(audit.error, undefined);
    const competitors = audit.checks.find((check) => check.id === 'competitors');
    assert.equal(competitors?.status, 'skipped');
    assert.match(competitors?.summary ?? '', /Nearby search failed.*Unsupported type/);
  });
});

describe('fetchSite', () => {
  it('returns the HTML on success', async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ body: '<html>ok</html>' }));
    assert.deepEqual(await fetchSite('https://shop.example/', fetchImpl), { ok: true, url: 'https://shop.example/', html: '<html>ok</html>' });
    assert.match(calls[0]!.headers.get('User-Agent') ?? '', /^local-presence-audit\//);
  });
  it('reports HTTP errors and network failures without throwing', async () => {
    const notFound = mockFetch(() => ({ status: 404, body: 'nope' }));
    assert.deepEqual(await fetchSite('https://shop.example/', notFound.fetchImpl), { ok: false, url: 'https://shop.example/', reason: 'HTTP 404' });
    const down = mockFetch(() => new TypeError('fetch failed'));
    assert.deepEqual(await fetchSite('https://shop.example/', down.fetchImpl), { ok: false, url: 'https://shop.example/', reason: 'request failed' });
  });
});

describe('HTML report', () => {
  it('is self-contained: no scripts, images, stylesheets or CSS url() requests', async () => {
    const { report } = await demoReport();
    const html = renderHtml(report);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!/<script|<img|<link|<iframe|@import|url\(/i.test(html));
    assert.match(html, /prefers-color-scheme:dark/);
    assert.match(html, /color-scheme:light dark/);
    assert.equal(html.match(/<section class="card" id="loc-/g)?.length, 3);
    assert.match(html, /<section class="card" id="summary">/);
    assert.equal(html.match(/class="check"/g)?.length, 18);
  });
  it('has no summary table for a single location', async () => {
    const { client, options } = demoSetup();
    const report = await runAudit([{ placeId: 'DEMO_corner_loaf' }], client, options);
    assert.ok(!renderHtml(report).includes('id="summary"'));
    assert.ok(!renderMarkdown(report).includes('## Summary'));
  });
  it('escapes listing content and refuses non-http links', async () => {
    assert.equal(escapeHtml(`<b a="1" c='2'>&`), '&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;');
    const place = makePlace({ displayName: { text: '<script>alert(1)</script>' }, googleMapsUri: 'javascript:alert(1)' });
    const { fetchImpl } = mockFetch((call) => (call.url.includes('/v1/places/') ? { body: place } : { body: {} }));
    const report = await runAudit(
      [{ placeId: 'place-1' }],
      new PlacesClient('k', fetchImpl),
      { radiusMeters: 500, competitorCount: 5, skip: new Set<Skippable>(['website', 'competitors']), now: DEMO_NOW, siteFetch: fetchImpl },
    );
    const html = renderHtml(report);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('href="javascript:'));
  });
});
