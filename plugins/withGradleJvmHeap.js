/* global require, module */

// Prebuild writes `org.gradle.jvmargs=-Xmx2048m ...`, and a release build with
// minification on runs R8 out of memory at 2 GB. eas.json's production profile
// passes GRADLE_OPTS for EAS builds, but a plain `./gradlew assembleRelease`
// only sees gradle.properties, so the heap is raised there.

const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS_KEY = 'org.gradle.jvmargs';
const GRADLE_JVM_HEAP = '-Xmx4096m';
// Gradle's own fallback metaspace (384m) is lower than the Expo template's, so a
// jvmargs line created from scratch keeps the template value.
const DEFAULT_JVM_ARGS = `${GRADLE_JVM_HEAP} -XX:MaxMetaspaceSize=512m`;

const withHeap = (jvmArgs) => {
  const otherArgs = jvmArgs.split(/\s+/).filter((arg) => arg !== '' && !arg.startsWith('-Xmx'));
  return [GRADLE_JVM_HEAP, ...otherArgs].join(' ');
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
module.exports.applyGradleJvmHeap = applyGradleJvmHeap;
