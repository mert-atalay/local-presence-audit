import type { LocationAudit, RunReport } from '../types.js';

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
export const dataSource = (report: RunReport) =>
  report.demo ? 'Listing data: invented demo fixtures.' : 'Listing data: Google Maps.';
export const scoreText = (score: number | null) => (score === null ? 'n/a' : `${score}/100`);

function renderLocation(location: LocationAudit): string[] {
  const lines: string[] = [`## ${location.name ?? location.label}`, ''];
  if (location.error) {
    lines.push(`Could not audit this location: ${location.error}`, '');
    return lines;
  }
  lines.push(`**Overall: ${scoreText(location.score)} (${location.status})**`, '');
  if (location.address) lines.push(`- Address: ${location.address}`);
  if (location.placeId) lines.push(`- Place id: \`${location.placeId}\``);
  if (location.googleMapsUri) lines.push(`- Google Maps: ${location.googleMapsUri}`);
  if (location.websiteUri) lines.push(`- Website: ${location.websiteUri}`);
  lines.push('', '### Fix list', '');
  if (location.fixes.length === 0) lines.push('Nothing to fix from these checks.');
  location.fixes.forEach((fix, index) => lines.push(`${index + 1}. **${fix.priority}**: ${fix.text}`));
  lines.push('', '### Checks', '');
  for (const check of location.checks) {
    lines.push(`#### ${check.title}: ${scoreText(check.score)} (${check.status})`, '', check.summary, '');
    for (const detail of check.details) lines.push(`- ${detail}`);
    if (check.details.length > 0) lines.push('');
  }
  return lines;
}

export function renderMarkdown(report: RunReport): string {
  const lines: string[] = ['# Local presence audit', ''];
  lines.push(`Generated ${report.generatedAt.slice(0, 10)} by ${report.tool} ${report.version}.`);
  if (report.demo) lines.push('', 'This is demo output. The businesses are invented and no live data was requested.');
  lines.push('');

  if (report.locations.length > 1) {
    lines.push('## Summary', '', 'Lowest score first.', '', '| Location | Score | Status | First fix |', '| --- | --- | --- | --- |');
    for (const location of report.locations) {
      const first = location.error ? `Not audited: ${location.error}` : (location.fixes[0]?.text ?? 'None');
      lines.push(`| ${cell(location.name ?? location.label)} | ${scoreText(location.score)} | ${location.status} | ${cell(first)} |`);
    }
    lines.push('');
  }

  for (const location of report.locations) lines.push(...renderLocation(location));

  lines.push(
    '---',
    '',
    `${dataSource(report)} Scores are rules of thumb from this tool, not Google ranking factors.`,
    'Review recency uses the small sample of reviews the API returns.',
    '',
  );
  return lines.join('\n');
}
