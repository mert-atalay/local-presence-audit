import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv, parseLocationsCsv } from '../src/input.js';

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, CRLF, BOM and blank lines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"line\nbreak",z');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['line\nbreak', 'z']]);
  });
});

describe('parseLocationsCsv', () => {
  it('reads place ids, queries, and name plus city', () => {
    const csv = 'Label,Place ID,query,name,city\nHQ,abc123,,,\n,,"Shop, Town",,\n,,,Cafe One,Springfield\n';
    assert.deepEqual(parseLocationsCsv(csv), [
      { label: 'HQ', placeId: 'abc123' },
      { label: 'Shop, Town', query: 'Shop, Town' },
      { label: 'Cafe One', query: 'Cafe One, Springfield' },
    ]);
  });
  it('rejects empty files, unknown headers and rows with nothing to look up', () => {
    assert.throws(() => parseLocationsCsv(''), /empty/);
    assert.throws(() => parseLocationsCsv('foo,bar\n1,2\n'), /header needs/);
    assert.throws(() => parseLocationsCsv('label,place_id\nOnly a label,\n'), /row 2/);
  });
});
