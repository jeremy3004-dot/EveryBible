import assert from 'node:assert/strict';
import test from 'node:test';

import * as edgeHashModule from '../../../supabase/functions/review-chapter-feedback/teamPasscodeHash';
import {
  DEFAULT_TEAM_PASSCODE_LENGTH,
  TEAM_PASSCODE_HASH_ALGORITHM,
  TEAM_PASSCODE_LENGTHS,
  generateTeamPasscode,
  hashTeamPasscode,
  newTeamPasscodeSalt,
} from './translator-access-crypto';

// supabase/functions is compiled as CommonJS (the repo root has no "type": "module"), so this
// ESM importer sees its exports on the namespace's default export.
type EdgeHashModule = typeof edgeHashModule;
const edgeHash: EdgeHashModule =
  (edgeHashModule as EdgeHashModule & { default?: EdgeHashModule }).default ?? edgeHashModule;

test('the admin hash matches the edge function hash for the same salt and passcode', async () => {
  for (const [salt, passcode] of [
    ['00112233445566778899aabbccddeeff', '615203'],
    [newTeamPasscodeSalt(), generateTeamPasscode()],
    [newTeamPasscodeSalt(), ''],
  ]) {
    assert.equal(hashTeamPasscode(salt, passcode), await edgeHash.hashTeamPasscode(salt, passcode));
  }
  assert.equal(TEAM_PASSCODE_HASH_ALGORITHM, edgeHash.TEAM_PASSCODE_HASH_ALGORITHM);
});

test('the hash format is pinned so stored rows stay verifiable', () => {
  // printf '00112233445566778899aabbccddeeff:615203' | shasum -a 256
  assert.equal(
    hashTeamPasscode('00112233445566778899aabbccddeeff', '615203'),
    '40339666d95b3f8bdd8d1e12558d82add10a740d60f09bbf7a6cd01ddeb9b6ff'
  );
});

test('salts are 32 lowercase hex characters and differ per call', () => {
  const salts = new Set(Array.from({ length: 50 }, () => newTeamPasscodeSalt()));
  assert.equal(salts.size, 50);
  for (const salt of salts) assert.match(salt, /^[0-9a-f]{32}$/);
});

test('generated passcodes default to six digits, which every installed app build accepts', () => {
  assert.equal(DEFAULT_TEAM_PASSCODE_LENGTH, 6);
  for (let index = 0; index < 200; index += 1) {
    assert.match(generateTeamPasscode(), /^[0-9]{6}$/);
  }
});

test('longer codes are digits of exactly the chosen length, up to the new keypad limit of 12', () => {
  assert.deepEqual([...TEAM_PASSCODE_LENGTHS], [6, 10, 12]);
  for (const length of TEAM_PASSCODE_LENGTHS) {
    for (let index = 0; index < 50; index += 1) {
      assert.match(generateTeamPasscode(length), new RegExp(`^[0-9]{${length}}$`));
    }
  }
});

test('a twelve-digit code hashes the same in the admin and the edge function', async () => {
  const salt = newTeamPasscodeSalt();
  const passcode = generateTeamPasscode(12);
  assert.equal(hashTeamPasscode(salt, passcode), await edgeHash.hashTeamPasscode(salt, passcode));
});
