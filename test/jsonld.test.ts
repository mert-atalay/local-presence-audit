import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenAddress, parseJsonLd } from '../src/jsonld.js';

const page = (...blocks: string[]) =>
  `<html><head>${blocks.map((block) => `<script type="application/ld+json">${block}</script>`).join('')}</head></html>`;

describe('parseJsonLd', () => {
  it('reads a plain LocalBusiness node', () => {
    const result = parseJsonLd(
      page(JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'A', telephone: '555-0100', address: '1 Main St' })),
    );
    assert.equal(result.blocks, 1);
    assert.deepEqual(result.businesses, [{ types: ['LocalBusiness'], name: 'A', telephone: '555-0100', address: '1 Main St' }]);
  });

  it('finds a subtype inside @graph and ignores other nodes', () => {
    const result = parseJsonLd(
      page(
        JSON.stringify({
          '@graph': [
            { '@type': 'WebSite', name: 'Site' },
            { '@type': ['Dentist', 'MedicalBusiness'], name: 'B', address: { '@type': 'PostalAddress', streetAddress: '2 Oak Ave', addressLocality: 'Town', postalCode: 'X1' } },
          ],
        }),
      ),
    );
    assert.equal(result.businesses.length, 1);
    assert.deepEqual(result.businesses[0], { types: ['Dentist', 'MedicalBusiness'], name: 'B', address: '2 Oak Ave, Town, X1' });
  });

  it('accepts a top-level array and full schema.org type URLs', () => {
    const result = parseJsonLd(page(JSON.stringify([{ '@type': 'https://schema.org/Restaurant', name: 'C' }])));
    assert.deepEqual(result.businesses, [{ types: ['Restaurant'], name: 'C' }]);
  });

  it('accepts an unknown type that has both an address and a phone', () => {
    const result = parseJsonLd(page(JSON.stringify({ '@type': 'Organization', name: 'D', telephone: '555-0101', address: '3 Elm Rd' })));
    assert.equal(result.businesses.length, 1);
    const none = parseJsonLd(page(JSON.stringify({ '@type': 'Organization', name: 'D' })));
    assert.equal(none.businesses.length, 0);
  });

  it('counts invalid blocks and still reads the valid ones', () => {
    const result = parseJsonLd(page('{ not json', JSON.stringify({ '@type': 'Store', name: 'E' })));
    assert.equal(result.blocks, 2);
    assert.equal(result.invalidBlocks, 1);
    assert.equal(result.businesses.length, 1);
  });

  it('handles attribute order, single quotes and pages with no JSON-LD', () => {
    const html = `<script id="x" type='application/ld+json' data-a="1">{"@type":"Bakery","name":"F"}</script>`;
    assert.equal(parseJsonLd(html).businesses[0]?.name, 'F');
    assert.deepEqual(parseJsonLd('<html><script>var a = 1;</script></html>'), { blocks: 0, invalidBlocks: 0, businesses: [] });
  });
});

describe('flattenAddress', () => {
  it('handles strings, objects, arrays and junk', () => {
    assert.equal(flattenAddress(' 1 Main St '), '1 Main St');
    assert.equal(flattenAddress([{ streetAddress: '1 Main St', postalCode: 'X1' }]), '1 Main St, X1');
    assert.equal(flattenAddress({}), undefined);
    assert.equal(flattenAddress(42), undefined);
  });
});
