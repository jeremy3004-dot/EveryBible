# Dependency hardening: 2026-09-05

## Initial approved changes

- Admin and site: `next` range raised to `^15.5.25`; resolved version **15.5.25**.
- Root and site: `@next/eslint-plugin-next` aligned to `^15.5.25`.
- Root: `sharp` raised to `^0.35.4`; resolved version **0.35.4**.
- Admin: removed unused `@trigger.dev/sdk`; no application imports were present.

Next 15.5.25 includes the fix for [GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj), affecting App Router Server Actions before 15.5.21. Sharp 0.35.4 includes the fix for [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj), affecting versions before 0.35.0. Next 15.5.25 accepts sharp 0.35.4. Sharp now requires Node >=20.9.0; the workspace CI uses Node 22.

## Generation and verification

The lock was generated using repository-pinned npm 11.11.0 in an isolated folder containing only copies of all workspace manifests and the existing lock. No dependency installation or lifecycle script ran during generation. The protected main-checkout dependency installation was untouched.

The machine-level seven-day release-age restriction initially rejected the new Next patch. A **command-scoped** `--min-release-age=0` exception was used for this explicitly approved security update. No user/global/project npm policy file was changed. The complete lock diff was reviewed to exclude unrelated recent upgrades.

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --min-release-age=0
```

- Root and workspace manifest dependency declarations match their lock records.
- Workspace links and lock metadata are unchanged.
- Repeating lock-only generation offline produced a byte-identical lock.
- Initial pass package entries: **1427 -> 1328**; **39 upgraded**, **2 added**, **101 removed**.
- The only other package metadata change is `node_modules/zod@4.3.6` gaining `dev: true`, because its production consumer was removed. Its version/integrity are unchanged.
- `npm ls --package-lock-only --all` reports the same pre-existing invalid `@types/react@19.1.10` peer in both the original and updated lock. This patch does not change React or its type packages.
- Semver, colour, and the emnapi runtime changes below are required by sharp 0.35.4 and its platform packages, rather than independent upgrades.

## Upgraded lock entries

| Lock entry | Before | After |
| --- | --- | --- |
| `node_modules/@emnapi/runtime` | 1.8.1 | 1.11.3 |
| `node_modules/@img/colour` | 1.0.0 | 1.1.0 |
| `node_modules/@img/sharp-darwin-arm64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-darwin-x64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-libvips-darwin-arm64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-darwin-x64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-arm` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-arm64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-ppc64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-riscv64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-s390x` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linux-x64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linuxmusl-arm64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-libvips-linuxmusl-x64` | 1.2.4 | 1.3.3 |
| `node_modules/@img/sharp-linux-arm` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linux-arm64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linux-ppc64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linux-riscv64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linux-s390x` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linux-x64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linuxmusl-arm64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-linuxmusl-x64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-wasm32` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-win32-arm64` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-win32-ia32` | 0.34.5 | 0.35.4 |
| `node_modules/@img/sharp-win32-x64` | 0.34.5 | 0.35.4 |
| `node_modules/@next/env` | 15.5.14 | 15.5.25 |
| `node_modules/@next/eslint-plugin-next` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-darwin-arm64` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-darwin-x64` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-linux-arm64-gnu` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-linux-arm64-musl` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-linux-x64-gnu` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-linux-x64-musl` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-win32-arm64-msvc` | 15.5.14 | 15.5.25 |
| `node_modules/@next/swc-win32-x64-msvc` | 15.5.14 | 15.5.25 |
| `node_modules/next` | 15.5.14 | 15.5.25 |
| `node_modules/semver` | 7.7.3 | 7.8.5 |
| `node_modules/sharp` | 0.34.5 | 0.35.4 |

## Added optional sharp platform entries

| Lock entry | Version |
| --- | --- |
| `node_modules/@img/sharp-freebsd-wasm32` | 0.35.4 |
| `node_modules/@img/sharp-webcontainers-wasm32` | 0.35.4 |

## Removed unused SDK dependency entries

These entries became unnecessary after removing the unused Trigger.dev SDK, including its nested versions and platform-specific optional dependencies. Shared packages still required by other workspace consumers remain locked.

| Removed lock entry | Version |
| --- | --- |
| `node_modules/@bugsnag/cuid` | 3.2.2 |
| `node_modules/@electric-sql/client` | 1.0.14 |
| `node_modules/@google-cloud/precise-date` | 4.0.0 |
| `node_modules/@jsonhero/path` | 1.0.21 |
| `node_modules/@microsoft/fetch-event-source` | 2.0.1 |
| `node_modules/@opentelemetry/api` | 1.9.0 |
| `node_modules/@opentelemetry/api-logs` | 0.203.0 |
| `node_modules/@opentelemetry/context-async-hooks` | 2.0.1 |
| `node_modules/@opentelemetry/core` | 2.0.1 |
| `node_modules/@opentelemetry/exporter-logs-otlp-http` | 0.203.0 |
| `node_modules/@opentelemetry/exporter-metrics-otlp-http` | 0.203.0 |
| `node_modules/@opentelemetry/exporter-trace-otlp-http` | 0.203.0 |
| `node_modules/@opentelemetry/host-metrics` | 0.37.0 |
| `node_modules/@opentelemetry/instrumentation` | 0.203.0 |
| `node_modules/@opentelemetry/otlp-exporter-base` | 0.203.0 |
| `node_modules/@opentelemetry/otlp-transformer` | 0.203.0 |
| `node_modules/@opentelemetry/resources` | 2.0.1 |
| `node_modules/@opentelemetry/sdk-logs` | 0.203.0 |
| `node_modules/@opentelemetry/sdk-metrics` | 2.0.1 |
| `node_modules/@opentelemetry/sdk-trace-base` | 2.0.1 |
| `node_modules/@opentelemetry/sdk-trace-node` | 2.0.1 |
| `node_modules/@opentelemetry/semantic-conventions` | 1.36.0 |
| `node_modules/@protobuf-ts/runtime` | 2.11.1 |
| `node_modules/@protobufjs/aspromise` | 1.1.2 |
| `node_modules/@protobufjs/base64` | 1.1.2 |
| `node_modules/@protobufjs/codegen` | 2.0.5 |
| `node_modules/@protobufjs/eventemitter` | 1.1.0 |
| `node_modules/@protobufjs/fetch` | 1.1.0 |
| `node_modules/@protobufjs/float` | 1.0.2 |
| `node_modules/@protobufjs/inquire` | 1.1.1 |
| `node_modules/@protobufjs/path` | 1.1.2 |
| `node_modules/@protobufjs/pool` | 1.1.0 |
| `node_modules/@protobufjs/utf8` | 1.1.1 |
| `node_modules/@rollup/rollup-darwin-arm64` | 4.60.3 |
| `node_modules/@s2-dev/streamstore` | 0.22.5 |
| `node_modules/@socket.io/component-emitter` | 3.1.2 |
| `node_modules/@trigger.dev/core` | 4.4.5 |
| `node_modules/@trigger.dev/core/node_modules/jose` | 5.10.0 |
| `node_modules/@trigger.dev/core/node_modules/nanoid` | 3.3.8 |
| `node_modules/@trigger.dev/core/node_modules/zod` | 3.25.76 |
| `node_modules/@trigger.dev/core/node_modules/zod-validation-error` | 1.5.0 |
| `node_modules/@trigger.dev/sdk` | 4.4.5 |
| `node_modules/@trigger.dev/sdk/node_modules/chalk` | 5.6.2 |
| `node_modules/@trigger.dev/sdk/node_modules/ws` | 8.20.0 |
| `node_modules/@types/cookie` | 0.4.1 |
| `node_modules/@types/cors` | 2.8.19 |
| `node_modules/acorn-import-attributes` | 1.9.5 |
| `node_modules/base64id` | 2.0.0 |
| `node_modules/bintrees` | 1.0.2 |
| `node_modules/cjs-module-lexer` | 1.4.3 |
| `node_modules/cors` | 2.8.6 |
| `node_modules/cronstrue` | 2.59.0 |
| `node_modules/dequal` | 2.0.3 |
| `node_modules/engine.io` | 6.5.5 |
| `node_modules/engine.io-client` | 6.5.4 |
| `node_modules/engine.io-client/node_modules/debug` | 4.3.7 |
| `node_modules/engine.io-client/node_modules/ws` | 8.17.1 |
| `node_modules/engine.io-parser` | 5.2.3 |
| `node_modules/engine.io/node_modules/cookie` | 0.4.2 |
| `node_modules/engine.io/node_modules/debug` | 4.3.7 |
| `node_modules/engine.io/node_modules/ws` | 8.17.1 |
| `node_modules/eventsource` | 3.0.7 |
| `node_modules/eventsource-parser` | 3.0.8 |
| `node_modules/evt` | 2.5.9 |
| `node_modules/execa` | 8.0.1 |
| `node_modules/execa/node_modules/mimic-fn` | 4.0.0 |
| `node_modules/execa/node_modules/onetime` | 6.0.0 |
| `node_modules/execa/node_modules/signal-exit` | 4.1.0 |
| `node_modules/get-stream` | 8.0.1 |
| `node_modules/human-signals` | 5.0.0 |
| `node_modules/humanize-duration` | 3.33.2 |
| `node_modules/import-in-the-middle` | 1.15.0 |
| `node_modules/is-stream` | 3.0.0 |
| `node_modules/long` | 5.3.2 |
| `node_modules/minimal-polyfills` | 2.2.3 |
| `node_modules/module-details-from-path` | 1.0.4 |
| `node_modules/npm-run-path` | 5.3.0 |
| `node_modules/npm-run-path/node_modules/path-key` | 4.0.0 |
| `node_modules/prom-client` | 15.1.3 |
| `node_modules/protobufjs` | 7.5.6 |
| `node_modules/require-in-the-middle` | 7.5.2 |
| `node_modules/run-exclusive` | 2.2.19 |
| `node_modules/slug` | 6.1.0 |
| `node_modules/socket.io` | 4.7.4 |
| `node_modules/socket.io-adapter` | 2.5.6 |
| `node_modules/socket.io-adapter/node_modules/ws` | 8.18.3 |
| `node_modules/socket.io-client` | 4.7.5 |
| `node_modules/socket.io-client/node_modules/debug` | 4.3.7 |
| `node_modules/socket.io-parser` | 4.2.6 |
| `node_modules/socket.io/node_modules/debug` | 4.3.7 |
| `node_modules/std-env` | 3.10.0 |
| `node_modules/strip-final-newline` | 3.0.0 |
| `node_modules/systeminformation` | 5.23.8 |
| `node_modules/tdigest` | 0.1.2 |
| `node_modules/tinyexec` | 0.3.2 |
| `node_modules/tsafe` | 1.8.12 |
| `node_modules/ulid` | 2.4.0 |
| `node_modules/uncrypto` | 0.1.3 |
| `node_modules/xmlhttprequest-ssl` | 2.0.0 |
| `node_modules/zod-error` | 1.5.0 |
| `node_modules/zod-error/node_modules/zod` | 3.25.76 |

## Compatible transitive security follow-up

A second bounded pass updated only security-affected transitive packages and the dependencies required by those patched releases. All root/workspace dependency declarations, direct resolved package versions, Expo/React/React Native/native module versions, Next 15.5.25, and sharp 0.35.4 remain unchanged. No overrides or forced major upgrades were introduced.

The seven-day release-age policy was retained for this pass with `--min-release-age=7`. npm 11.11.0 documents this flag in **days**, unlike the machine's separate `minimum-release-age=10080` minutes setting. The existing locked Next/sharp exception was not broadened.

```sh
npm update <named-transitive-packages> --package-lock-only --ignore-scripts --save=false --min-release-age=7
```

The reviewed follow-up changes **70 existing lock entries**, adds **1 required types package**, and removes **4 obsolete XML parser entries**, for a final **1325 package entries**. Twenty-six upgrades are esbuild's matching optional platform binaries. These are development build tools; mobile native packages remain unchanged. Two unnecessary upgrades to already-patched Expo-nested `picomatch` and `ws` were discarded. An offline lock-only regeneration was byte-identical after review.

The production audits use the same `npm audit --package-lock-only --omit=dev --json` flags. Package/metavulnerability entries fell from **48 to 32**, including **2 to 1 critical**, **19 to 9 high**, **26 to 22 moderate**, and **1 to 0 low**. These counts include dependent-package chains rather than 32 distinct underlying bugs. The remaining direct advisory sources are `tar`, `postcss`, `image-size`, `decode-uri-component`, and `uuid`.

The compatible fixes cleared these production package advisory groups: `@aws-sdk/xml-builder`, `@babel/core`, `@xmldom/xmldom`, `brace-expansion`, `browserslist`, `fast-uri`, `fast-xml-builder`, `fast-xml-parser`, `js-yaml`, `lodash`, `nanoid`, `picomatch`, `protocol-buffers-schema`, `shell-quote`, `undici`, `ws`.

### Exact follow-up upgrades

| Lock entry | Before | After |
| --- | --- | --- |
| `node_modules/@aws-sdk/xml-builder` | 3.972.16 | 3.972.40 |
| `node_modules/@babel/core` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/core/node_modules/@babel/code-frame` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helper-module-transforms` | 7.28.6 | 7.29.7 |
| `node_modules/@babel/helpers` | 7.28.6 | 7.29.7 |
| `node_modules/@esbuild/aix-ppc64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/android-arm` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/android-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/android-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/darwin-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/darwin-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/freebsd-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/freebsd-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-arm` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-ia32` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-loong64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-mips64el` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-ppc64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-riscv64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-s390x` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/linux-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/netbsd-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/netbsd-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/openbsd-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/openbsd-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/openharmony-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/sunos-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/win32-arm64` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/win32-ia32` | 0.27.3 | 0.27.7 |
| `node_modules/@esbuild/win32-x64` | 0.27.3 | 0.27.7 |
| `node_modules/@eslint/config-array/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/@eslint/eslintrc/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/@eslint/eslintrc/node_modules/js-yaml` | 4.1.1 | 4.3.2 |
| `node_modules/@expo/fingerprint/node_modules/brace-expansion` | 5.0.7 | 5.0.9 |
| `node_modules/@expo/xcpretty/node_modules/js-yaml` | 4.3.0 | 4.3.2 |
| `node_modules/@humanfs/core` | 0.19.1 | 0.19.2 |
| `node_modules/@humanfs/node` | 0.16.7 | 0.16.8 |
| `node_modules/@react-native/codegen/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/@react-native/dev-middleware/node_modules/ws` | 6.2.3 | 6.2.6 |
| `node_modules/@smithy/types` | 4.13.1 | 4.17.2 |
| `node_modules/@supabase/realtime-js/node_modules/ws` | 8.20.0 | 8.21.3 |
| `node_modules/@xmldom/xmldom` | 0.8.11 | 0.8.15 |
| `node_modules/baseline-browser-mapping` | 2.9.17 | 2.11.20 |
| `node_modules/brace-expansion` | 2.0.2 | 2.1.4 |
| `node_modules/browserslist` | 4.28.1 | 4.28.8 |
| `node_modules/caniuse-lite` | 1.0.30001766 | 1.0.30001810 |
| `node_modules/electron-to-chromium` | 1.5.277 | 1.5.416 |
| `node_modules/esbuild` | 0.27.3 | 0.27.7 |
| `node_modules/eslint-plugin-react/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/eslint/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/fast-uri` | 3.1.0 | 3.1.6 |
| `node_modules/flatted` | 3.3.3 | 3.4.4 |
| `node_modules/glob/node_modules/brace-expansion` | 5.0.4 | 5.0.9 |
| `node_modules/js-yaml` | 3.14.2 | 3.15.2 |
| `node_modules/lodash` | 4.17.23 | 4.18.1 |
| `node_modules/nanoid` | 3.3.11 | 3.3.18 |
| `node_modules/node-releases` | 2.0.27 | 2.0.54 |
| `node_modules/picomatch` | 2.3.1 | 2.3.2 |
| `node_modules/protocol-buffers-schema` | 3.6.0 | 3.6.1 |
| `node_modules/react-native/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/react-native/node_modules/ws` | 6.2.3 | 6.2.6 |
| `node_modules/rimraf/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/shell-quote` | 1.8.3 | 1.10.0 |
| `node_modules/test-exclude/node_modules/brace-expansion` | 1.1.12 | 1.1.18 |
| `node_modules/tinyglobby/node_modules/picomatch` | 4.0.3 | 4.0.7 |
| `node_modules/tmp` | 0.2.5 | 0.2.7 |
| `node_modules/undici` | 6.27.0 | 6.28.0 |
| `node_modules/update-browserslist-db` | 1.2.3 | 1.3.2 |
| `node_modules/ws` | 7.5.10 | 7.5.13 |

### Follow-up additions and removals

| Action | Lock entry | Version |
| --- | --- | --- |
| Added | `node_modules/@humanfs/types` | 0.15.0 |
| Removed | `node_modules/fast-xml-builder` | 1.1.4 |
| Removed | `node_modules/fast-xml-parser` | 5.5.8 |
| Removed | `node_modules/path-expression-matcher` | 1.2.0 |
| Removed | `node_modules/strnum` | 2.2.2 |

### Known version-boundary residuals

- `tar@7.5.10` remains because the installed Supabase CLI pins that exact version. Replacing it requires a separate CLI update or a deliberate override; neither was introduced in this transitive-only pass.
- PostCSS remains pinned to `8.4.31` by Next and constrained to `~8.4.32` by Expo Metro config. The patched 8.5 series falls outside those parent contracts.
- Older UUID, decode-uri-component/query-string, and image-size paths remain tied to the existing Expo, React Navigation, or Metro dependency families. No forced framework migration was attempted.
