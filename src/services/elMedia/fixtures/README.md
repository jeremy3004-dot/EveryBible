# EL media fixtures

These files are copied byte-for-byte from Every Language's fixture pack
`lqd-fixture-pack-2026-07-18.zip` (handoff `lqd-jeremy-handoff-2026-07-19`). They are
dev-key-signed (`lqd-dev-2026-a`) real signed documents — `catalog.dev.json` and
`manifest-lqdtest.json` are `{keyId, algorithm, compactJws}` envelopes whose payloads are
verified through the same ES256 JWS code path as production content, and `dev.jwks.json`
holds the public JWKS that verifies them. They exist solely so the elMedia unit tests can
exercise real verification offline. Do not edit or reformat these files — their bytes are
signature-protected and any change (including whitespace) will break verification.
