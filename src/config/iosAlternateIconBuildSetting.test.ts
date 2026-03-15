import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ios project compiles the discreet alternate icon asset catalog', () => {
  const projectFile = fs.readFileSync(
    path.join(process.cwd(), 'ios/EveryBible.xcodeproj/project.pbxproj'),
    'utf8',
  );

  const matches = projectFile.match(
    /ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = DiscreetAppIcon;/g,
  );

  assert.equal(
    matches?.length,
    2,
    'Expected DiscreetAppIcon build setting in both Debug and Release configurations.',
  );
});
