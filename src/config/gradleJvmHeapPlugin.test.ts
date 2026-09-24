import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExpoConfig } from 'expo/config';
import {
  parsePropertiesFile,
  propertiesListToString,
} from '@expo/config-plugins/build/android/Properties';
import withGradleJvmHeap from '../../plugins/withGradleJvmHeap';

type PropertiesItem = ReturnType<typeof parsePropertiesFile>[number];

const pluginExports = withGradleJvmHeap as unknown as {
  GRADLE_JVM_HEAP: string;
  applyGradleJvmHeap: (properties: PropertiesItem[]) => PropertiesItem[];
};

const { GRADLE_JVM_HEAP, applyGradleJvmHeap } = pluginExports;

// The jvmargs line `expo prebuild` generates for SDK 54 projects.
const PREBUILD_GRADLE_PROPERTIES = `# Project-wide Gradle settings.
# Specifies the JVM arguments used for the daemon process.
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m

org.gradle.parallel=true
android.useAndroidX=true
`;

const jvmArgsOf = (properties: PropertiesItem[]): string[] =>
  properties.flatMap((item) =>
    item.type === 'property' && item.key === 'org.gradle.jvmargs' ? [item.value] : []
  );

test('the Gradle heap is raised to 4 GB so R8 does not run out of memory', () => {
  assert.equal(GRADLE_JVM_HEAP, '-Xmx4096m');

  const result = applyGradleJvmHeap(parsePropertiesFile(PREBUILD_GRADLE_PROPERTIES));

  assert.deepEqual(jvmArgsOf(result), ['-Xmx4096m -XX:MaxMetaspaceSize=512m']);
});

test('the rest of gradle.properties is left exactly as prebuild wrote it', () => {
  const result = propertiesListToString(
    applyGradleJvmHeap(parsePropertiesFile(PREBUILD_GRADLE_PROPERTIES))
  );

  assert.equal(
    result,
    propertiesListToString(parsePropertiesFile(PREBUILD_GRADLE_PROPERTIES)).replace(
      '-Xmx2048m',
      '-Xmx4096m'
    )
  );
});

test('other JVM arguments survive, and any duplicate heap flag is dropped', () => {
  const result = applyGradleJvmHeap(
    parsePropertiesFile(
      'org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8 -Xmx1024m\n'
    )
  );

  assert.deepEqual(jvmArgsOf(result), [
    '-Xmx4096m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8',
  ]);
});

test('a jvmargs line without a heap flag gets one added in front', () => {
  const result = applyGradleJvmHeap(
    parsePropertiesFile('org.gradle.jvmargs=-XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8\n')
  );

  assert.deepEqual(jvmArgsOf(result), [
    '-Xmx4096m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8',
  ]);
});

test('a gradle.properties with no jvmargs line gets the 4 GB heap and the template metaspace', () => {
  const result = applyGradleJvmHeap(parsePropertiesFile('android.useAndroidX=true\n'));

  assert.deepEqual(jvmArgsOf(result), ['-Xmx4096m -XX:MaxMetaspaceSize=512m']);
});

test('running the transform twice changes nothing the second time', () => {
  const once = applyGradleJvmHeap(parsePropertiesFile(PREBUILD_GRADLE_PROPERTIES));

  assert.deepEqual(applyGradleJvmHeap(once), once);
});

test('the plugin rewrites gradle.properties through the prebuild gradleProperties mod', async () => {
  const config = withGradleJvmHeap({ name: 'EveryBible', slug: 'EveryBible' } as ExpoConfig) as {
    mods?: { android?: { gradleProperties?: (config: unknown) => Promise<unknown> } };
  };
  const mod = config.mods?.android?.gradleProperties;
  assert.ok(mod, 'Expected the plugin to register an android gradleProperties mod');

  const result = (await mod({
    ...config,
    modRequest: { platform: 'android', modName: 'gradleProperties' },
    modResults: parsePropertiesFile(PREBUILD_GRADLE_PROPERTIES),
  })) as { modResults: PropertiesItem[] };

  assert.deepEqual(jvmArgsOf(result.modResults), ['-Xmx4096m -XX:MaxMetaspaceSize=512m']);
});
