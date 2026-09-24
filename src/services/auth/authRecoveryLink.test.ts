import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeRecoveryTokenClaims,
  parseAuthRecoveryTokens,
  resolveRecoveryLinkAudience,
} from './authRecoveryLink';

test('parseAuthRecoveryTokens extracts access/refresh tokens from a fragment-based recovery link', () => {
  const url =
    'com.everybible.app://reset-password#access_token=abc123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens extracts tokens from a query-based recovery link', () => {
  const url =
    'com.everybible.app://reset-password?access_token=abc123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens decodes URL-encoded token characters', () => {
  const url =
    'com.everybible.app://reset-password#access_token=abc%2F123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc/123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens returns null for non-recovery auth links', () => {
  const url =
    'com.everybible.app://reset-password#access_token=abc123&refresh_token=def456&type=signup';

  assert.equal(parseAuthRecoveryTokens(url), null);
});

test('parseAuthRecoveryTokens returns null when tokens are missing', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://reset-password#type=recovery'), null);
});

test('parseAuthRecoveryTokens returns null for links with no fragment or query', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://reset-password'), null);
});

test('parseAuthRecoveryTokens returns null for unrelated deep links', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://bible/jhn/3/16'), null);
});

test('parseAuthRecoveryTokens rejects recovery-looking links from other hosts under our scheme', () => {
  assert.equal(
    parseAuthRecoveryTokens(
      'com.everybible.app://bible#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
});

test('parseAuthRecoveryTokens rejects host prefixes that only look like reset-password', () => {
  assert.equal(
    parseAuthRecoveryTokens(
      'com.everybible.app://reset-password.attacker.example#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
  assert.equal(
    parseAuthRecoveryTokens(
      'com.everybible.app://reset-passwordx#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
});

test('parseAuthRecoveryTokens rejects other schemes carrying a crafted recovery fragment', () => {
  assert.equal(
    parseAuthRecoveryTokens(
      'https://everybible.app/reset-password#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
  assert.equal(
    parseAuthRecoveryTokens(
      'exp://127.0.0.1:8081/--/reset-password#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
  assert.equal(
    parseAuthRecoveryTokens(
      'evil://reset-password#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    null
  );
});

test('parseAuthRecoveryTokens accepts the app link with a trailing slash and mixed-case scheme', () => {
  assert.deepEqual(
    parseAuthRecoveryTokens(
      'COM.EVERYBIBLE.APP://Reset-Password/#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    { accessToken: 'abc123', refreshToken: 'def456' }
  );
});

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${body}.signature`;
}

test('decodeRecoveryTokenClaims reads the email and subject from an access token payload', () => {
  const token = encodeJwtPayload({
    email: 'reader@example.com',
    sub: 'user-123',
    role: 'authenticated',
  });

  assert.deepEqual(decodeRecoveryTokenClaims(token), {
    email: 'reader@example.com',
    subject: 'user-123',
  });
});

test('decodeRecoveryTokenClaims handles non-ASCII payloads without atob', () => {
  const token = encodeJwtPayload({ email: 'lecteur+é@exämple.com', sub: 'user-é' });

  assert.deepEqual(decodeRecoveryTokenClaims(token), {
    email: 'lecteur+é@exämple.com',
    subject: 'user-é',
  });
});

test('decodeRecoveryTokenClaims returns empty claims for malformed tokens', () => {
  assert.deepEqual(decodeRecoveryTokenClaims('not-a-jwt'), { email: null, subject: null });
  assert.deepEqual(decodeRecoveryTokenClaims('a.!!!!.c'), { email: null, subject: null });
  assert.deepEqual(decodeRecoveryTokenClaims(encodeJwtPayload({})), { email: null, subject: null });
});

// Builds a token whose payload segment is the given raw bytes (not JSON-encoded).
function tokenWithPayloadBytes(bytes: number[] | string, padded = false): string {
  const encoded = Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${padded ? encoded : encoded.replace(/=+$/, '')}.signature`;
}

test('decodeRecoveryTokenClaims decodes three- and four-byte UTF-8 claims and tolerates base64 padding', () => {
  const token = tokenWithPayloadBytes(
    JSON.stringify({ email: '読者📖@example.com', sub: 'u' }),
    true
  );
  assert.match(token, /=\.signature$/);

  assert.deepEqual(decodeRecoveryTokenClaims(token), {
    email: '読者📖@example.com',
    subject: 'u',
  });
});

test('decodeRecoveryTokenClaims rejects payloads that are not valid UTF-8', () => {
  const invalid: Record<string, number[]> = {
    'a stray continuation byte as a lead byte': [0x7b, 0x80, 0x7d],
    'an overlong two-byte lead': [0x7b, 0xc0, 0x80, 0x7d],
    'a sequence truncated at the end': [0x7b, 0xe3, 0x81],
    'a lead byte followed by ASCII instead of a continuation': [0x7b, 0xe3, 0x41, 0x41, 0x7d],
    'a code point above U+10FFFF': [0x7b, 0xf4, 0x90, 0x80, 0x80, 0x7d],
  };

  for (const [label, bytes] of Object.entries(invalid)) {
    assert.deepEqual(
      decodeRecoveryTokenClaims(tokenWithPayloadBytes(bytes)),
      { email: null, subject: null },
      label
    );
  }
});

test('decodeRecoveryTokenClaims returns empty claims when the payload is not a JSON object', () => {
  for (const payload of ['null', '42', '"reader@example.com"', '{"email":']) {
    assert.deepEqual(
      decodeRecoveryTokenClaims(tokenWithPayloadBytes(payload)),
      { email: null, subject: null },
      payload
    );
  }
});

test('decodeRecoveryTokenClaims ignores empty and non-string claims', () => {
  assert.deepEqual(decodeRecoveryTokenClaims(encodeJwtPayload({ email: '', sub: 42 })), {
    email: null,
    subject: null,
  });
});

test('resolveRecoveryLinkAudience refuses a link issued for a different signed-in account', () => {
  assert.equal(resolveRecoveryLinkAudience('user-attacker', 'user-victim'), 'different-account');
});

test('resolveRecoveryLinkAudience allows the link when it matches the signed-in account', () => {
  assert.equal(resolveRecoveryLinkAudience('user-victim', 'user-victim'), 'match');
});

test('resolveRecoveryLinkAudience allows the link when nobody is signed in or the subject is unknown', () => {
  assert.equal(resolveRecoveryLinkAudience('user-victim', null), 'match');
  assert.equal(resolveRecoveryLinkAudience('user-victim', undefined), 'match');
  assert.equal(resolveRecoveryLinkAudience(null, 'user-victim'), 'match');
});
