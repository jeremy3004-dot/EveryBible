# Offline Bible installation

Both catalog text-pack downloads and legacy Supabase verse downloads build a staging SQLite database. Installation verifies the staging database's verses table and expected verse count and closes all database handles before replacing the installed file. Legacy writers also close their handle when schema creation, transactions, or progress callbacks fail.

Catalog text packs reject unsuccessful HTTP responses. When the catalog supplies `expectedSha256`, it must be a 64-character hexadecimal SHA-256 digest. The installer reads and hashes the staging bytes with the existing pure-JavaScript EL cryptography helpers, including standard Base64 decoding. Verification runs on Hermes without Web Crypto or `atob`. Missing read capability, read errors, invalid encoding, malformed checksums, and checksum mismatches fail the install; none bypass validation. Without a declared checksum, SQLite validation still runs, using the supplied verse count or a minimum of one verse.

A failed download or staging validation only cleans staging artifacts and leaves the installed Bible intact. During activation, the existing database and SQLite sidecars move to temporary `.rollback` paths. If moving the verified staging file into place fails, the installer removes any partial replacement and restores those originals. Successful replacement removes the temporary backup. The bundled database schema and version constants do not change.

If filesystem restoration itself fails, the error identifies the preserved rollback path. A later install refuses to overwrite a remaining rollback backup; it requires recovery first. This is filesystem error recovery, not a crash-safe transaction: process termination during replacement may require recovering that backup. Concurrent installations/readers are outside this workflow's guarantees. A callback failure after successful activation leaves the newly verified Bible installed.

Behavioral tests execute the real installer with native filesystem, SQLite, and Supabase boundaries replaced by small fixtures. They seed an existing Bible and cover failure preservation, staging-first validation, closed handles, replacement/rollback, and hashing without browser globals:

```bash
node --test --import tsx src/services/bible/cloudTranslationInstall.test.ts src/services/bible/cloudTranslationService.test.ts
```
