---
phase: quick
plan: 260322-twy
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/upload-bsb-audio.sh
  - src/services/audio/audioRemote.ts
  - src/constants/translations.ts
  - src/types/bible.ts
  - src/services/bible/bibleDataModel.ts
  - src/stores/persistedStateSanitizers.ts
autonomous: false
requirements: []

must_haves:
  truths:
    - "BSB audio files are accessible from Supabase Storage at bible-audio/bsb/{BOOK_ID}/{chapter}.m4a"
    - "App resolves BSB audio URLs to Supabase Storage with .m4a extension"
    - "No references to openbible-bsb-souer remain in the codebase"
  artifacts:
    - path: "scripts/upload-bsb-audio.sh"
      provides: "Upload script for 1,189 BSB .m4a files to Supabase Storage"
    - path: "src/services/audio/audioRemote.ts"
      provides: "Supabase-storage strategy with .m4a extension support for BSB"
    - path: "src/types/bible.ts"
      provides: "AudioProvider type without openbible-bsb-souer"
  key_links:
    - from: "src/constants/translations.ts (BSB entry)"
      to: "src/services/audio/audioRemote.ts (supabase-storage strategy)"
      via: "Removed audioProvider field causes defaultRemoteAudioMetadataResolver to return no provider; BSB must resolve via supabase-storage through catalog or a new default path"
      pattern: "strategy.*supabase-storage"
---

<objective>
Upload 1,189 BSB .m4a audio files to a new `bible-audio` Supabase Storage bucket, update the app's audio resolver to use Supabase Storage with .m4a extension for BSB, and remove all traces of the `openbible-bsb-souer` provider.

Purpose: Move BSB audio hosting from openbible.com (third-party, .mp3) to self-hosted Supabase Storage (.m4a), giving full control over availability, format, and CDN caching.

Output: All BSB audio served from Supabase Storage; openbible provider fully removed.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/services/audio/audioRemote.ts
@src/constants/translations.ts
@src/types/bible.ts
@src/services/bible/bibleDataModel.ts
@src/stores/persistedStateSanitizers.ts

<interfaces>
<!-- Key types the executor needs -->

From src/types/bible.ts:
```typescript
export type AudioProvider = 'bible-is' | 'ebible-webbe' | 'openbible-bsb-souer';
// audioProvider field on BibleTranslation (line 138) is optional
```

From src/services/audio/audioRemote.ts:
```typescript
// RemoteAudioMetadata.audio union includes:
// { strategy: 'supabase-storage' }  ← already supported (line 184-187)
// URL pattern (line 428): ${SUPABASE_AUDIO_BUCKET_BASE}/${translationId}/${bookId}/${chapter}.mp3
// ← needs to support .m4a for BSB

// defaultRemoteAudioMetadataResolver (line 192-224):
// If translation.audioProvider is set → returns { strategy: 'provider', provider: ... }
// If NOT set and hasAudio=true → returns { hasAudio: true } with NO audio block
// ← BSB needs to get { strategy: 'supabase-storage' } when audioProvider is removed
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create upload script and upload 1,189 BSB .m4a files to Supabase Storage</name>
  <files>scripts/upload-bsb-audio.sh</files>
  <action>
1. Create a `bible-audio` bucket in Supabase Storage set to public access:
   ```
   supabase --experimental storage create bible-audio --public
   ```
   Use the linked project (ref: ganmududzdzpruvdulkg). If the bucket already exists, skip creation.

2. Create `scripts/upload-bsb-audio.sh` that:
   - Defines a mapping from the filename book abbreviation (mixed case: Gen, Exo, Mat, Mrk, Jhn, Tts, etc.) to the app's canonical BOOK_ID (uppercase: GEN, EXO, MAT, MRK, JHN, TIT, etc.)
   - IMPORTANT: The filename uses `Tts` for Titus but the app uses `TIT`. All others are straightforward uppercase of the 3-letter abbreviation.
   - Iterates over all .m4a files in both source directories:
     `/Users/dev/Desktop/Bible App!!!/Audio Bible/BSB-32kbps/BSB_00_Souer_OT/`
     `/Users/dev/Desktop/Bible App!!!/Audio Bible/BSB-32kbps/BSB_00_Souer_NT/`
   - Parses each filename `BSB_XX_Abc_NNN.m4a` to extract book abbr and chapter number
   - Strips leading zeros from chapter (001 -> 1)
   - Uploads to Supabase Storage path: `bible-audio/bsb/{BOOK_ID}/{chapter}.m4a`
   - Uses: `supabase --experimental storage cp "{local_path}" "ss:///bible-audio/bsb/{BOOK_ID}/{chapter}.m4a"`
   - Logs progress (e.g., "Uploading GEN/1.m4a ... [42/1189]")
   - Continues on individual file errors (don't abort entire run)

3. Run the script. This will take several minutes for 1,189 files (~1.2GB total). Run in foreground so we can monitor progress.

4. After upload completes, verify a sample of files are accessible:
   - Construct the public URL: `{SUPABASE_URL}/storage/v1/object/public/bible-audio/bsb/GEN/1.m4a`
   - `curl -sI` a few sample URLs (GEN/1, PSA/23, MAT/1, REV/22) to confirm 200 status and correct content-type
  </action>
  <verify>
    <automated>curl -sI "$(grep EXPO_PUBLIC_SUPABASE_URL /Users/dev/conductor/workspaces/EveryBible/columbus/.env | cut -d= -f2)/storage/v1/object/public/bible-audio/bsb/GEN/1.m4a" | head -1 | grep -q "200"</automated>
  </verify>
  <done>All 1,189 .m4a files uploaded to bible-audio/bsb/{BOOK_ID}/{chapter}.m4a in Supabase Storage; sample URLs return HTTP 200</done>
</task>

<task type="auto">
  <name>Task 2: Update app code to use supabase-storage for BSB and remove openbible-bsb-souer provider</name>
  <files>src/services/audio/audioRemote.ts, src/constants/translations.ts, src/types/bible.ts, src/services/bible/bibleDataModel.ts, src/stores/persistedStateSanitizers.ts</files>
  <action>
**src/types/bible.ts:**
- Remove `'openbible-bsb-souer'` from the `AudioProvider` union type (line 28). Result: `AudioProvider = 'bible-is' | 'ebible-webbe'`

**src/constants/translations.ts:**
- Remove the `audioProvider: 'openbible-bsb-souer'` line from the BSB entry (line 19)
- BSB entry keeps `hasAudio: true` and `audioGranularity: 'chapter'`

**src/services/audio/audioRemote.ts:**
- Delete the `OPENBIBLE_BSB_SOUER_AUDIO_BASE` constant (line 15)
- Delete the entire `buildOpenBibleBsbSouerChapterAudioUrl` function (lines 297-315)
- In `buildProviderChapterAudioUrl` (lines 317-331): remove the `if (provider === 'openbible-bsb-souer')` branch (lines 322-324)
- In `isRemoteAudioAvailable` (line 472): remove `|| audio.provider === 'openbible-bsb-souer'` from the condition

- **Critical change** in `defaultRemoteAudioMetadataResolver` (lines 192-224): After removing `audioProvider` from BSB, the function currently falls through to the final return which has no `audio` block, so BSB audio would silently stop working. Fix by adding a fallback: when `translation.hasAudio === true` AND no `audioProvider` is set AND `SUPABASE_AUDIO_BUCKET_BASE` is available, return `{ strategy: 'supabase-storage' }` as the audio block. This makes supabase-storage the default for any translation with audio but no explicit provider.

- **Extension change** in the `supabase-storage` URL builder (line 428): The current hardcoded `.mp3` extension must support `.m4a`. Since BSB files are `.m4a` and future uploads may vary, change the extension logic: accept an optional `audioExtension` field on the `supabase-storage` strategy variant in `RemoteAudioMetadata`, defaulting to `'mp3'` for backward compatibility. The URL becomes: `${SUPABASE_AUDIO_BUCKET_BASE}/${translationId}/${bookId}/${chapter}.${ext}`.

  Update the `RemoteAudioMetadata` type's `supabase-storage` variant to:
  ```typescript
  {
    strategy: 'supabase-storage';
    extension?: string; // file extension without dot, defaults to 'mp3'
  }
  ```

  In the supabase-storage URL builder (line 424-432), use:
  ```typescript
  const ext = audio.extension ?? 'mp3';
  const url = `${SUPABASE_AUDIO_BUCKET_BASE}/${translationId}/${bookId}/${chapter}.${ext}`;
  ```

  In the `defaultRemoteAudioMetadataResolver` fallback for hasAudio+no-provider, set `extension: 'm4a'` since BSB is the only translation hitting this path and its files are .m4a. (If WEB or others later move to supabase-storage, they can specify their own extension via catalog metadata.)

**src/services/bible/bibleDataModel.ts:**
- Remove `'openbible-bsb-souer'` from the `validAudioProviders` set (line 23)

**src/stores/persistedStateSanitizers.ts:**
- Remove `'openbible-bsb-souer'` from the `validAudioProviders` set (line 42)
  </action>
  <verify>
    <automated>cd /Users/dev/conductor/workspaces/EveryBible/columbus && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>BSB audio resolves to supabase-storage with .m4a extension; openbible-bsb-souer fully removed from types, constants, services, and sanitizers; TypeScript compiles clean</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>BSB audio migrated from openbible.com to self-hosted Supabase Storage (.m4a). All 1,189 chapter files uploaded. App code updated to resolve BSB audio via supabase-storage strategy.</what-built>
  <how-to-verify>
    1. Run `npx expo start` and open on a device/simulator
    2. Navigate to Bible reader with BSB translation selected
    3. Play audio for a few chapters (e.g., Genesis 1, Psalm 23, Matthew 1)
    4. Verify audio streams correctly from Supabase Storage
    5. Verify download-for-offline still works for BSB audio chapters
    6. Switch to WEB translation and verify its audio still works via eBible.org (no regression)
  </how-to-verify>
  <resume-signal>Type "approved" or describe any playback issues</resume-signal>
</task>

</tasks>

<verification>
- `curl -sI` returns 200 for sample BSB audio URLs from Supabase Storage (GEN/1, PSA/23, MAT/1, REV/22)
- `npx tsc --noEmit` passes with no errors
- `grep -r "openbible-bsb-souer" src/` returns zero matches
- `grep -r "OPENBIBLE_BSB" src/` returns zero matches
- BSB audio plays in the app from Supabase Storage
- WEB audio still plays from eBible.org (no regression)
</verification>

<success_criteria>
- 1,189 BSB .m4a files accessible in Supabase Storage at bible-audio/bsb/{BOOK_ID}/{chapter}.m4a
- App resolves BSB audio to Supabase Storage URLs with .m4a extension
- openbible-bsb-souer provider completely removed from codebase
- WEB translation audio unaffected
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/260322-twy-upload-bsb-m4a-audio-to-supabase-storage/260322-twy-SUMMARY.md`
</output>
