import assert from 'node:assert/strict';
import test from 'node:test';

import { macrolanguageMapFromPages, parseMacrolanguageTable } from './iso-macrolanguages';

// Rows in the layout of SIL's iso-639-3-macrolanguages.tab
// (ISO 639-3 codes from iso639-3.sil.org, SIL International).
const FIXTURE = 'M_Id\tI_Id\tI_Status\naka\tfat\tA\naka\ttwi\tA\nara\taao\tA\nara\tajp\tR\n';

test('parses active members by macrolanguage and drops retired ones', () => {
  assert.deepEqual(parseMacrolanguageTable(FIXTURE), { aka: ['fat', 'twi'], ara: ['aao'] });
  assert.deepEqual(parseMacrolanguageTable(`\uFEFF${FIXTURE.replaceAll('\n', '\r\n')}`), {
    aka: ['fat', 'twi'],
    ara: ['aao'],
  });
});

test('rejects anything that is not the macrolanguage table', () => {
  assert.throws(() => parseMacrolanguageTable('<!DOCTYPE html><html>'), /header/);
  assert.throws(() => parseMacrolanguageTable('M_Id\tI_Id\tI_Status\n'), /no rows/);
  assert.throws(() => parseMacrolanguageTable('M_Id\tI_Id\tI_Status\nArabic\tarb\tA'), /row/);
});

test('recovers the mapping a set of pages uses from their member links', () => {
  const page = (slug: string, iso6393: string | null, members: string[] = []) => ({
    slug,
    iso6393,
    members: members.map((member) => ({ slug: member })),
  });
  const pages = {
    arabic: page('arabic', 'ara', ['standard-arabic', 'gulf-arabic']),
    'standard-arabic': page('standard-arabic', 'arb'),
    'gulf-arabic': page('gulf-arabic', 'afb'),
    twi: page('twi', 'twi'),
  };
  assert.deepEqual(macrolanguageMapFromPages(pages), { ara: ['afb', 'arb'] });
  assert.throws(
    () => macrolanguageMapFromPages({ ...pages, 'gulf-arabic': page('gulf-arabic', null) }),
    /no ISO 639-3 code/
  );
});
