import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../app/api/csp-report/route';
import { parseCspReports } from './csp-report';

test('parses the legacy report-uri body', () => {
  assert.deepEqual(
    parseCspReports({
      'csp-report': {
        'document-uri': 'https://everybible.app/',
        'effective-directive': 'connect-src',
        'blocked-uri': 'https://example.test',
        'source-file': 'https://everybible.app/_next/static/chunks/app.js',
      },
    }),
    [
      {
        directive: 'connect-src',
        blocked: 'https://example.test',
        document: 'https://everybible.app/',
        source: 'https://everybible.app/_next/static/chunks/app.js',
      },
    ]
  );
});

test('parses Reporting API arrays and ignores other report types', () => {
  assert.deepEqual(
    parseCspReports([
      { type: 'deprecation', body: { id: 'x' } },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://everybible.app/languages',
          effectiveDirective: 'img-src',
          blockedURL: 'https://img.test/a.png',
        },
      },
    ]),
    [
      {
        directive: 'img-src',
        blocked: 'https://img.test/a.png',
        document: 'https://everybible.app/languages',
        source: '',
      },
    ]
  );
  assert.deepEqual(parseCspReports('nonsense'), []);
});

test('the report endpoint rejects oversized and malformed bodies', async () => {
  const big = new Request('https://everybible.app/api/csp-report', {
    method: 'POST',
    body: 'x'.repeat(20_000),
  });
  assert.equal((await POST(big)).status, 413);

  const malformed = new Request('https://everybible.app/api/csp-report', {
    method: 'POST',
    body: '{',
  });
  assert.equal((await POST(malformed)).status, 400);
});

test('the report endpoint logs one line per violation and returns 204', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const response = await POST(
    new Request('https://everybible.app/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src' } }),
    })
  );
  assert.equal(response.status, 204);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(warn.mock.calls[0].arguments[0], '[csp-report]');
});
