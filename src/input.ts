import type { LocationInput } from './types.js';

/** Small CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/**
 * Columns (header row required, any order): label, place_id, query, name, city.
 * Each row needs a place_id, or a query, or a name (city optional but recommended).
 */
export function parseLocationsCsv(text: string): LocationInput[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('The CSV file is empty.');
  const columns = header.map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const known = ['label', 'place_id', 'query', 'name', 'city'];
  if (!columns.some((column) => known.includes(column))) {
    throw new Error(`The CSV header needs at least one of: ${known.join(', ')}.`);
  }

  return rows.map((cells, index) => {
    const get = (column: string) => (cells[columns.indexOf(column)] ?? '').trim();
    const placeId = get('place_id');
    const query = get('query') || [get('name'), get('city')].filter(Boolean).join(', ');
    if (!placeId && !query) throw new Error(`CSV row ${index + 2} has no place_id, query or name.`);
    const location: LocationInput = { label: get('label') || get('name') || query || placeId };
    if (placeId) location.placeId = placeId;
    else location.query = query;
    return location;
  });
}
