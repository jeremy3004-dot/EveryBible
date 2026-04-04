import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReleaseSigningState,
  normalizeSha1Fingerprint,
  parseAppleDistributionFingerprints,
} from './releaseSigningGuard';

test('parseAppleDistributionFingerprints keeps only Apple Distribution identities', () => {
  const output = [
    '  1) 1766B7940E2F0C555ED6FC50C1033105082A5D2A "Apple Distribution: Old Release (NVC9N47PRH)"',
    '  2) ABCDEF1234567890ABCDEF1234567890ABCDEF12 "Apple Development: Debug Cert (NVC9N47PRH)"',
    '  3) A1483EC32D67279C512DF857DD042A3EC5C64214 "Apple Distribution: Matching Release (NVC9N47PRH)"',
    '     2 valid identities found',
  ].join('\n');

  assert.deepEqual(parseAppleDistributionFingerprints(output), [
    '1766B7940E2F0C555ED6FC50C1033105082A5D2A',
    'A1483EC32D67279C512DF857DD042A3EC5C64214',
  ]);
});

test('evaluateReleaseSigningState rejects stale Apple Distribution identities before build', () => {
  const result = evaluateReleaseSigningState({
    profileFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    certFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    appleDistributionFingerprints: [
      '1766B7940E2F0C555ED6FC50C1033105082A5D2A',
      'A1483EC32D67279C512DF857DD042A3EC5C64214',
    ],
  });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /Multiple Apple Distribution identities are visible/,
    'Expected the guard to reject a keychain collision'
  );
});

test('evaluateReleaseSigningState accepts a single matching release identity', () => {
  const result = evaluateReleaseSigningState({
    profileFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    certFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    appleDistributionFingerprints: ['A1483EC32D67279C512DF857DD042A3EC5C64214'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('normalizeSha1Fingerprint strips separators and prefixes', () => {
  assert.equal(
    normalizeSha1Fingerprint('SHA1 Fingerprint= a1:b2:c3:d4 '),
    'A1B2C3D4'
  );
});
