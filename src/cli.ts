#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runAudit, SKIPPABLE, type AuditOptions, type Skippable } from './audit.js';
import { createDemoFetch, DEMO_API_KEY, DEMO_NOW, FIXTURES_DIR } from './demo.js';
import { parseLocationsCsv } from './input.js';
import { PlacesClient } from './places.js';
import { renderHtml } from './report/html.js';
import { renderMarkdown, scoreText } from './report/markdown.js';
import type { FetchLike, LocationInput } from './types.js';
import { TOOL_NAME, VERSION } from './version.js';

const HELP = `${TOOL_NAME} ${VERSION}

Audit the public Google Maps listing of one or more business locations.

Usage:
  ${TOOL_NAME} audit --demo
  ${TOOL_NAME} audit --place-id <id>
  ${TOOL_NAME} audit --query "Business name, City"
  ${TOOL_NAME} audit --input locations.csv

Options:
  --demo               Run on the bundled invented businesses. No key, no network.
  --place-id <id>      Google place id of one location.
  --query <text>       Name and city of one location. Resolved with Text Search.
  --input <file>       CSV with a header row. Columns: label, place_id, query, name, city.
  --out <dir>          Output directory. Default: reports
  --basename <name>    Output file name without extension. Default: report (demo: demo-report)
  --radius <meters>    Competitor search radius, 1 to 50000. Default: 2000
  --competitors <n>    Number of nearest competitors to compare, 1 to 19. Default: 10
  --skip <list>        Comma separated: reviews, website, competitors.
                       "reviews" drops the reviews and editorialSummary fields,
                       which keeps Place Details out of the highest billing tier.
  --language <code>    languageCode for the Places API, for example en.
  --region <code>      regionCode for the Places API, for example ca.
  --help, --version

A live run needs GOOGLE_MAPS_API_KEY in the environment or in a .env file.`;

function fail(message: string): never {
  console.error(`Error: ${message}\n\nRun "${TOOL_NAME} --help" for usage.`);
  process.exit(1);
}

function intOption(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) fail(`--${name} must be a whole number from ${min} to ${max}.`);
  return parsed;
}

async function main(): Promise<void> {
  const parsed = (() => {
    try {
      return parseArgs({
        allowPositionals: true,
        options: {
          demo: { type: 'boolean', default: false },
          'place-id': { type: 'string' },
          query: { type: 'string' },
          input: { type: 'string' },
          out: { type: 'string', default: 'reports' },
          basename: { type: 'string' },
          radius: { type: 'string' },
          competitors: { type: 'string' },
          skip: { type: 'string' },
          language: { type: 'string' },
          region: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false },
          version: { type: 'boolean', short: 'v', default: false },
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  })();
  const { values, positionals } = parsed;

  if (values.version) return console.log(VERSION);
  if (values.help || positionals[0] === 'help') return console.log(HELP);
  if (positionals.length > 0 && positionals[0] !== 'audit') fail(`Unknown command "${positionals[0]}". The only command is "audit".`);

  const skip = new Set<Skippable>();
  for (const name of (values.skip ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    if (!SKIPPABLE.includes(name as Skippable)) fail(`--skip accepts: ${SKIPPABLE.join(', ')}. Got "${name}".`);
    skip.add(name as Skippable);
  }

  const sources = [values.demo, values['place-id'], values.query, values.input].filter(Boolean).length;
  if (sources === 0) fail('Give one of --demo, --place-id, --query or --input.');
  if (sources > 1) fail('Give only one of --demo, --place-id, --query or --input.');

  let inputs: LocationInput[];
  let apiKey: string;
  let fetchImpl: FetchLike;
  let now: Date;

  if (values.demo) {
    inputs = parseLocationsCsv(readFileSync(join(FIXTURES_DIR, 'locations.csv'), 'utf8'));
    apiKey = DEMO_API_KEY;
    fetchImpl = createDemoFetch();
    now = DEMO_NOW;
  } else {
    try {
      process.loadEnvFile?.();
    } catch {
      // No .env file. The key may still be in the environment.
    }
    apiKey = process.env['GOOGLE_MAPS_API_KEY'] ?? '';
    if (!apiKey) fail('GOOGLE_MAPS_API_KEY is not set. Put it in the environment or in a .env file, or try --demo.');
    fetchImpl = fetch;
    now = new Date();
    if (values.input) {
      try {
        inputs = parseLocationsCsv(readFileSync(values.input, 'utf8'));
      } catch (error) {
        return fail(`Could not read ${values.input}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (inputs.length === 0) fail(`${values.input} has no location rows.`);
    } else if (values['place-id']) {
      inputs = [{ placeId: values['place-id'] }];
    } else {
      inputs = [{ query: values.query! }];
    }
  }

  const options: AuditOptions = {
    radiusMeters: intOption(values.radius, 2000, 1, 50000, 'radius'),
    competitorCount: intOption(values.competitors, 10, 1, 19, 'competitors'),
    skip,
    now,
    siteFetch: fetchImpl,
    demo: values.demo,
  };
  const clientOptions: { languageCode?: string; regionCode?: string } = {};
  if (values.language) clientOptions.languageCode = values.language;
  if (values.region) clientOptions.regionCode = values.region;
  const client = new PlacesClient(apiKey, fetchImpl, clientOptions);

  console.log(`Auditing ${inputs.length} location${inputs.length === 1 ? '' : 's'}${values.demo ? ' (demo fixtures)' : ''}...`);
  const report = await runAudit(inputs, client, options);

  const base = values.basename ?? (values.demo ? 'demo-report' : 'report');
  mkdirSync(values.out, { recursive: true });
  const files = {
    json: join(values.out, `${base}.json`),
    md: join(values.out, `${base}.md`),
    html: join(values.out, `${base}.html`),
  };
  writeFileSync(files.json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(files.md, renderMarkdown(report));
  writeFileSync(files.html, renderHtml(report));

  for (const location of report.locations) {
    const name = location.name ?? location.label;
    console.log(location.error ? `  n/a      ${name}: ${location.error}` : `  ${scoreText(location.score).padEnd(8)} ${name} (${location.status})`);
  }
  console.log(`\nWrote ${files.json}\nWrote ${files.md}\nWrote ${files.html}`);

  if (report.locations.every((location) => location.error)) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
