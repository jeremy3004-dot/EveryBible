import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_SITE_URL,
} from '../../lib/site-links';
import { GET } from './route';

const download = (userAgent?: string) =>
  GET(
    new Request('https://everybible.app/download', {
      headers: userAgent === undefined ? {} : { 'user-agent': userAgent },
    })
  );

test('/download temporarily redirects Android phones to Google Play', () => {
  const response = download(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36'
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), EVERYBIBLE_GOOGLE_PLAY_URL);
});

test('/download sends iPhone, iPad and iPadOS desktop-mode Safari to the App Store', () => {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  ]) {
    const response = download(userAgent);
    assert.equal(response.status, 307, userAgent);
    assert.equal(response.headers.get('location'), EVERYBIBLE_APP_STORE_URL, userAgent);
  }
});

test('/download sends desktop browsers and clients without a user agent to the download section', () => {
  for (const userAgent of [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/123.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/130.0',
    undefined,
  ]) {
    const response = download(userAgent);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `${EVERYBIBLE_SITE_URL}/#download`);
  }
});
