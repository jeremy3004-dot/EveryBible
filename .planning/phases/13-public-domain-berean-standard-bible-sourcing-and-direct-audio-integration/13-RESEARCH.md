# Phase 13 Research

## Primary Sources

- Berean licensing page: [https://berean.bible/licensing.htm](https://berean.bible/licensing.htm)
- Berean terms page: [https://berean.bible/terms.htm](https://berean.bible/terms.htm)
- Berean downloads page: [https://berean.bible/downloads.htm](https://berean.bible/downloads.htm)
- Official BSB text download: [https://bereanbible.com/bsb.txt](https://bereanbible.com/bsb.txt)
- Official BSB USX download: [https://bereanbible.com/bsb_usx.zip](https://bereanbible.com/bsb_usx.zip)
- Official BSB audio landing page: [https://audiobible.org/](https://audiobible.org/)
- Public BSB audio chapter pages: [https://biblehub.com/audio/genesis/1.htm](https://biblehub.com/audio/genesis/1.htm)

## Findings

- The official Berean licensing page says the Berean Bible texts were placed into the public domain on April 30, 2023.
- The official Berean terms page repeats that public-domain dedication date and explicitly says all uses are freely permitted.
- The official downloads page exposes first-party text artifacts in multiple formats, including plain text and USX.
- The official audio page says the BSB audio narrated by Bob Souer, Barry Hays, and Jordan Gilbert is dedicated to the public domain under CC0 1.0.
- Live Bible Hub BSB chapter pages expose direct MP3 URLs on `openbible.com`, so the app can resolve deterministic chapter audio without an API key.

## Integration Notes

### Runtime audio

- Current repo state: BSB text is already bundled locally, but BSB audio still depends on `Bible.is`.
- Lowest-risk swap: keep `translationId='bsb'`, change only the BSB audio provider metadata, and add one direct MP3 URL builder alongside the existing WEB builder.
- Direct URL pattern verified from live pages:
  - `https://openbible.com/audio/souer/BSB_01_Gen_001.mp3`
  - `https://openbible.com/audio/souer/BSB_19_Psa_150.mp3`
  - `https://openbible.com/audio/souer/BSB_46_1Co_013.mp3`

### Bundled text artifacts

- Current repo state: `scripts/process-bsb.js` still depends on a checked-in `data/bsb_complete.json`.
- Better long-term source of truth: official Berean downloads, especially `bsb_usx.zip`, because it preserves richer structure than the flat text export.
- This text refresh is separate from the runtime audio swap and is safer as a second plan.

## Recommended Phase Split

- **Plan 13-01:** switch runtime BSB audio to direct public MP3s, add tests, and normalize licensing/docs.
- **Plan 13-02:** replace the BSB refresh/import pipeline with official Berean downloads and regenerate bundled artifacts from first-party sources.
