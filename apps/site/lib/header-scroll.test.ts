import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HEADER_SCROLL_THRESHOLD, isHeaderScrolled } from '../components/HeaderScrollState';
import { homeCopyEn } from './home-copy';
import { siteNavigation } from './site-content';

test('header turns solid only past the scroll threshold', () => {
  assert.equal(isHeaderScrolled(0), false);
  assert.equal(isHeaderScrolled(HEADER_SCROLL_THRESHOLD), false);
  assert.equal(isHeaderScrolled(HEADER_SCROLL_THRESHOLD + 1), true);
});

test('every nav item key resolves to its English label and the atlas opens explore mode', () => {
  for (const item of siteNavigation) {
    assert.equal(homeCopyEn.nav[item.key], item.label);
  }
  assert.equal(siteNavigation.find((item) => item.key === 'atlas')?.href, '/#explore');
});
