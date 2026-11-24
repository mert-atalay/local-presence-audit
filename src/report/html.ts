import type { CheckResult, LocationAudit, RunReport, Status } from '../types.js';
import { dataSource, scoreText } from './markdown.js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

/** Only http(s) links are turned into anchors. */
function link(url: string, label: string): string {
  return /^https?:\/\//i.test(url) ? `<a href="${e(url)}" rel="noopener noreferrer">${e(label)}</a>` : e(label);
}

const STATUS_LABEL: Record<Status, string> = { pass: 'Pass', warn: 'Needs attention', fail: 'Fail', skipped: 'Not scored' };

const badge = (status: Status) => `<span class="badge ${status}">${STATUS_LABEL[status]}</span>`;

const meter = (score: number | null, status: Status) =>
  score === null ? '' : `<div class="meter" aria-hidden="true"><span class="${status}" style="width:${score}%"></span></div>`;

const CSS = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#5c6570;--line:#dfe3e8;--link:#0b57d0;
--pass:#167030;--warn:#855600;--fail:#b91c1c;--skip:#57606a;--pass-bg:#dafbe1;--warn-bg:#fff4cf;--fail-bg:#ffe5e3;--skip-bg:#eaeef2}
@media (prefers-color-scheme:dark){:root{--bg:#0f1317;--card:#171c22;--text:#e6eaef;--muted:#9aa5b1;--line:#2b333c;--link:#7fb2ff;
--pass:#56d364;--warn:#e3b341;--fail:#ff7b72;--skip:#8b949e;--pass-bg:#12301c;--warn-bg:#3a2d0a;--fail-bg:#42181a;--skip-bg:#252c34}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 48px}
h1{font-size:1.75rem;margin:0 0 4px}h2{font-size:1.35rem;margin:0}h3{font-size:1rem;margin:24px 0 8px}h4{font-size:1rem;margin:0}
p{margin:8px 0}a{color:var(--link)}.muted{color:var(--muted);font-size:.9rem}
.notice{border:1px solid var(--line);border-left:4px solid var(--warn);background:var(--card);padding:10px 14px;border-radius:6px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin:20px 0}
.head{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.score{font-size:2.25rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}.score small{font-size:1rem;font-weight:400;color:var(--muted)}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:600;white-space:nowrap}
.badge.pass{color:var(--pass);background:var(--pass-bg)}.badge.warn{color:var(--warn);background:var(--warn-bg)}
.badge.fail{color:var(--fail);background:var(--fail-bg)}.badge.skipped{color:var(--skip);background:var(--skip-bg)}
.badge.high{color:var(--fail);background:var(--fail-bg)}.badge.medium{color:var(--warn);background:var(--warn-bg)}.badge.low{color:var(--skip);background:var(--skip-bg)}
.meter{height:6px;background:var(--skip-bg);border-radius:3px;overflow:hidden;margin:8px 0}
.meter span{display:block;height:100%}.meter .pass{background:var(--pass)}.meter .warn{background:var(--warn)}.meter .fail{background:var(--fail)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
ol.fixes{padding-left:22px;margin:8px 0}ol.fixes li{margin:6px 0}
.check{border-top:1px solid var(--line);padding:14px 0 6px}.check ul{margin:6px 0;padding-left:20px;color:var(--muted);font-size:.92rem}
.check li{overflow-wrap:anywhere}dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:12px 0 0;font-size:.92rem}
dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}footer{margin-top:32px}
`.trim();

function renderCheck(check: CheckResult): string {
  const details = check.details.length > 0 ? `<ul>${check.details.map((detail) => `<li>${e(detail)}</li>`).join('')}</ul>` : '';
  return `<div class="check" data-check="${check.id}">
<div class="head"><h4>${e(check.title)}</h4><span><strong>${scoreText(check.score)}</strong> ${badge(check.status)}</span></div>
${meter(check.score, check.status)}
<p>${e(check.summary)}</p>
${details}
</div>`;
}

function renderLocation(location: LocationAudit, index: number): string {
  const title = e(location.name ?? location.label);
  if (location.error) {
    return `<section class="card" id="loc-${index}">
<div class="head"><h2>${title}</h2>${badge('skipped')}</div>
<p>Could not audit this location: ${e(location.error)}</p>
</section>`;
  }
  const facts = [
    location.address ? `<dt>Address</dt><dd>${e(location.address)}</dd>` : '',
    location.placeId ? `<dt>Place id</dt><dd><code>${e(location.placeId)}</code></dd>` : '',
    location.googleMapsUri ? `<dt>Google Maps</dt><dd>${link(location.googleMapsUri, 'Open listing')}</dd>` : '',
    location.websiteUri ? `<dt>Website</dt><dd>${link(location.websiteUri, location.websiteUri)}</dd>` : '',
  ].join('');
  const fixes =
    location.fixes.length === 0
      ? '<p>Nothing to fix from these checks.</p>'
      : `<ol class="fixes">${location.fixes
          .map((fix) => `<li><span class="badge ${fix.priority}">${fix.priority}</span> ${e(fix.text)}</li>`)
          .join('')}</ol>`;
  return `<section class="card" id="loc-${index}">
<div class="head"><h2>${title}</h2><div><span class="score">${location.score ?? 'n/a'}<small>/100</small></span> ${badge(location.status)}</div></div>
${meter(location.score, location.status)}
<dl>${facts}</dl>
<h3>Fix list</h3>
${fixes}
<h3>Checks</h3>
${location.checks.map(renderCheck).join('\n')}
</section>`;
}

function renderSummary(report: RunReport): string {
  if (report.locations.length < 2) return '';
  const rows = report.locations
    .map((location, index) => {
      const first = location.error ? `Not audited: ${location.error}` : (location.fixes[0]?.text ?? 'None');
      return `<tr><td><a href="#loc-${index}">${e(location.name ?? location.label)}</a></td><td class="num">${scoreText(location.score)}</td><td>${badge(location.status)}</td><td>${e(first)}</td></tr>`;
    })
    .join('\n');
  return `<section class="card" id="summary">
<h2>Summary</h2>
<p class="muted">${report.locations.length} locations, lowest score first.</p>
<div class="scroll"><table>
<thead><tr><th>Location</th><th>Score</th><th>Status</th><th>First fix</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>`;
}

/** One self-contained page: inline CSS, no scripts, no images, no external requests. */
export function renderHtml(report: RunReport): string {
  const demo = report.demo
    ? '<p class="notice">This is demo output. The businesses are invented and no live data was requested.</p>'
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Local presence audit</title>
<style>
${CSS}
</style>
</head>
<body>
<main>
<header>
<h1>Local presence audit</h1>
<p class="muted">Generated ${e(report.generatedAt.slice(0, 10))} by ${e(report.tool)} ${e(report.version)}</p>
${demo}
</header>
${renderSummary(report)}
${report.locations.map(renderLocation).join('\n')}
<footer class="muted">
<p>${e(dataSource(report))} Scores are rules of thumb from this tool, not Google ranking factors. Review recency uses the small sample of reviews the API returns.</p>
</footer>
</main>
</body>
</html>
`;
}
