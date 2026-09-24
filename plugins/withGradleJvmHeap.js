/* global require, module */

// Prebuild writes `org.gradle.jvmargs=-Xmx2048m ...`, and a release build with
// minification on runs R8 out of memory at 2 GB. eas.json's production profile
// passes GRADLE_OPTS for EAS builds, but a plain `./gradlew assembleRelease`
// only sees gradle.properties, so the heap is raised there.
//
// The metaspace cap is raised too. Lint and KSP run as workers inside the Gradle
// daemon, and on a release build they exhausted the template's 512 MB metaspace
// ("OutOfMemoryError: Metaspace"). EAS never hit this: its GRADLE_OPTS replaces the
// whole jvmargs line, so EAS builds run with no metaspace cap at all.

const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS_KEY = 'org.gradle.jvmargs';
const GRADLE_JVM_HEAP = '-Xmx4096m';
const GRADLE_JVM_METASPACE = '-XX:MaxMetaspaceSize=1024m';
const DEFAULT_JVM_ARGS = `${GRADLE_JVM_HEAP} ${GRADLE_JVM_METASPACE}`;

const withHeap = (jvmArgs) => {
  const otherArgs = jvmArgs
    .split(/\s+/)
    .filter(
      (arg) => arg !== '' && !arg.startsWith('-Xmx') && !arg.startsWith('-XX:MaxMetaspaceSize=')
    );
  return [GRADLE_JVM_HEAP, GRADLE_JVM_METASPACE, ...otherArgs].join(' ');
};

const applyGradleJvmHeap = (properties) => {
  const hasJvmArgs = properties.some(
    (item) => item.type === 'property' && item.key === JVM_ARGS_KEY
  );

  if (!hasJvmArgs) {
    return [...properties, { type: 'property', key: JVM_ARGS_KEY, value: DEFAULT_JVM_ARGS }];
  }

  return properties.map((item) =>
    item.type === 'property' && item.key === JVM_ARGS_KEY
      ? { ...item, value: withHeap(item.value) }
      : item
  );
};

const withGradleJvmHeap = (config) =>
  withGradleProperties(config, (nextConfig) => {
    nextConfig.modResults = applyGradleJvmHeap(nextConfig.modResults);
    return nextConfig;
  });

module.exports = withGradleJvmHeap;
module.exports.GRADLE_JVM_HEAP = GRADLE_JVM_HEAP;
module.exports.GRADLE_JVM_METASPACE = GRADLE_JVM_METASPACE;
module.exports.applyGradleJvmHeap = applyGradleJvmHeap;
