import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addressesMatch, addressTokens, namesMatch, normalizePhone, phonesMatch } from '../src/normalize.js';

describe('phone normalisation', () => {
  it('keeps digits only and drops extensions and leading zeros', () => {
    assert.equal(normalizePhone('(604) 555-0142'), '6045550142');
    assert.equal(normalizePhone('+1 604-555-0142 ext. 12'), '16045550142');
    assert.equal(normalizePhone('020 7946 0018'), '2079460018');
    assert.equal(normalizePhone('0044 20 7946 0018'), '442079460018');
  });
  it('matches national and international forms of the same number', () => {
    assert.ok(phonesMatch('(604) 555-0142', '+1-604-555-0142'));
    assert.ok(phonesMatch('020 7946 0018', '+44 20 7946 0018'));
  });
  it('does not match different numbers, short fragments or empty values', () => {
    assert.ok(!phonesMatch('(604) 555-0142', '(604) 555-0199'));
    assert.ok(!phonesMatch('555-0142', '0142'));
    assert.ok(!phonesMatch('', '(604) 555-0142'));
  });
});

describe('name matching', () => {
  it('ignores case, accents, punctuation and company suffixes', () => {
    assert.ok(namesMatch('Café Olé Ltd.', 'cafe ole'));
    assert.ok(namesMatch("Joe's Diner", 'Joes Diner Inc'));
  });
  it('accepts one name being the other plus extra words', () => {
    assert.ok(namesMatch('Corner Loaf Bakery', 'Corner Loaf Bakery & Cafe'));
  });
  it('rejects different names and empty names', () => {
    assert.ok(!namesMatch('Corner Loaf Bakery', 'Hollow Oven Bakery'));
    assert.ok(!namesMatch('', 'Anything'));
  });
});

describe('address matching', () => {
  it('normalises street type and direction words', () => {
    assert.deepEqual(addressTokens('214 Alder Street North, Suite 5'), ['214', 'alder', 'st', 'n', 'ste', '5']);
  });
  it('matches a short site address against the full listing address', () => {
    assert.ok(addressesMatch('214 Alder Street, Maple Hollow, BC V0X 1A1, Canada', '214 Alder St., Maple Hollow, V0X 1A1'));
    assert.ok(addressesMatch('12 Rue de l’Église, Montréal, QC H2X 1Y4, Canada', '12 rue de l\'eglise, Montreal, H2X 1Y4'));
  });
  it('fails on a different street number or postal code', () => {
    assert.ok(!addressesMatch('214 Alder Street, Maple Hollow, BC V0X 1A1, Canada', '241 Alder St, Maple Hollow, V0X 1A1'));
    assert.ok(!addressesMatch('214 Alder Street, Maple Hollow, BC V0X 1A1, Canada', '214 Alder St, Maple Hollow, V0X 9Z9'));
  });
  it('fails on a different street with the same number', () => {
    assert.ok(!addressesMatch('214 Alder Street, Maple Hollow, BC, Canada', '214 Birch Avenue, Pine Ridge'));
  });
  it('fails when either side is empty', () => {
    assert.ok(!addressesMatch('', '214 Alder St'));
    assert.ok(!addressesMatch('214 Alder St', ''));
  });
});
