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

test('evaluateReleaseSigningState rejects a profile signed by a different certificate', () => {
  const result = evaluateReleaseSigningState({
    profileFingerprint: '1766B7940E2F0C555ED6FC50C1033105082A5D2A',
    certFingerprint: 'a1:48:3e:c3:2d:67:27:9c:51:2d:f8:57:dd:04:2a:3e:c5:c6:42:14',
    appleDistributionFingerprints: ['A1483EC32D67279C512DF857DD042A3EC5C64214'],
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ['Provisioning profile and distribution certificate fingerprints do not match.'],
  });
});

test('evaluateReleaseSigningState rejects a keychain with no Apple Distribution identity', () => {
  const result = evaluateReleaseSigningState({
    profileFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    certFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    appleDistributionFingerprints: [],
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ['No Apple Distribution identities are visible in the current keychain search list.'],
  });
});

test('evaluateReleaseSigningState rejects a keychain whose only identity is not the release certificate', () => {
  const result = evaluateReleaseSigningState({
    profileFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    certFingerprint: 'A1483EC32D67279C512DF857DD042A3EC5C64214',
    appleDistributionFingerprints: ['1766B7940E2F0C555ED6FC50C1033105082A5D2A'],
  });

  assert.deepEqual(result, {
    ok: false,
    errors: [
      'The matching Apple Distribution certificate is not visible in the current keychain search list.',
    ],
  });
});

test('parseAppleDistributionFingerprints de-duplicates an identity listed in several keychains', () => {
  const line =
    '  1) a1483ec32d67279c512df857dd042a3ec5c64214 "Apple Distribution: Release (NVC9N47PRH)"';

  assert.deepEqual(parseAppleDistributionFingerprints(`${line}\r\n${line.replace('1)', '2)')}`), [
    'A1483EC32D67279C512DF857DD042A3EC5C64214',
  ]);
});

test('normalizeSha1Fingerprint strips separators and prefixes', () => {
  assert.equal(normalizeSha1Fingerprint('SHA1 Fingerprint= a1:b2:c3:d4 '), 'A1B2C3D4');
});
