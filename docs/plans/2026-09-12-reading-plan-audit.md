# Reading plan audit — 2026-09-12

Audited all 23 active mobile plans from the bundled catalog. The retired SQL seed generator is not the mobile source of truth. No plan IDs, schedules, Bible text, saved enrollments, or remote data were replaced.

## Content and coverage

Every advertised day has entries. Every book, chapter, and explicit verse boundary resolves in the shipped BSB database. Whole-book plans cover their intended chapters exactly once; all full-Bible plans contain all 1,189 chapters. Sermon on the Mount covers all 111 verses of Matthew 5–7 exactly once. Verse numbering gaps in BSB are translation features, not missing plan assignments.

Reviewed the nine topical/devotional selections against their stated themes: salvation history, prayer, identity in Christ, the kingdom, spiritual warfare, holiness, mission, obedience, and hearing God. These are Scripture-reading selections, without additional authored devotional essays.

| Plan | Days | Passage entries | Coverage |
| --- | ---: | ---: | --- |
| Bible in One Year | 365 | 365 | 1189 chapters |
| New Testament in 90 Days | 90 | 90 | 260 chapters |
| Psalms in 30 Days | 30 | 30 | 150 chapters |
| The Gospels in 60 Days | 60 | 60 | 89 chapters |
| Daily Proverbs Chapter | 31 (recurring) | 31 | 31 chapters |
| Kathisma | 7 (recurring) | 20 | 150 chapters |
| Whole Bible: Book by Book | 365 | 365 | 1189 chapters |
| Epistles in 30 Days | 30 | 30 | 121 chapters |
| Sermon on the Mount | 7 | 7 | 111 verses in Matthew 5–7 |
| Full Bible in 30 Days | 30 | 94 | 1189 chapters |
| Full Bible in 90 Days | 90 | 151 | 1189 chapters |
| New Testament in 30 Days | 30 | 51 | 260 chapters |
| Gospels in 30 Days | 30 | 33 | 89 chapters |
| Acts in 28 Days | 28 | 28 | 28 chapters |
| Foundations of the Gospel | 14 | 18 | 46 chapters |
| Prayer & Intimacy with God | 7 | 12 | 25 chapters |
| Identity in Christ | 7 | 8 | 24 chapters |
| The Kingdom of God | 14 | 14 | 42 chapters |
| Spiritual Warfare | 7 | 14 | 22 chapters |
| Holiness & Sanctification | 14 | 18 | 42 chapters |
| The Great Commission & Mission | 7 | 12 | 25 chapters |
| Faith & Obedience | 7 | 9 | 24 chapters |
| Hearing God’s Voice | 7 | 10 | 22 chapters |

Kathisma's 20 ranges match the Hebrew-numbered divisions published by the [Orthodox Church in America](https://www.oca.org/liturgics/outlines/the-division-of-the-psalter-into-kathismas). Its weekly schedule is a fixed devotional cycle, not a complete seasonal liturgical calendar; the OCA's [Matins](https://www.oca.org/liturgics/outlines/kathisma-readings-at-matins) and [Vespers](https://www.oca.org/liturgics/outlines/kathisma-readings-at-vespers) schedules also include seasonal variations.

## Corrections

- Replaced misleading metadata in all 21 interface locales: the annual plan reads sequentially rather than pairing OT/NT every day; the former “Chronological Bible” is now “Whole Bible: Book by Book,” with a description naming its Genesis, Job, Exodus opening. The category label is now “Whole Bible.” Existing identifiers and schedules remain stable.
- Preserve catalog passage order in daily targets and combined rhythms. Lexical ID sorting had moved part 10 ahead of part 2, including day 23 of the 30-day Bible challenge.
- Show exact verse ranges for Sermon on the Mount and focus the first assigned verse in the reader. Partial-chapter completion does not mark the whole chapter read or make another day's passage appear complete.
- Require all Kathisma sessions to be explicitly completed, even when evening is read first. Completion labels and return navigation follow the remaining sessions.
- Resolve recurring plans by today's date on Home and inside combined rhythms. Catch-up completion is keyed to the selected day in the current month/week. The monthly ledger excludes nonexistent dates and refreshes its date when focused.
- Keep completed sequential plans displaying their final valid day instead of an out-of-range day such as 8 of 7.
- Make shared test mocks compatible with CI's Node 22 and the local Node 26 runtime; wait for the actual background plan-progress write in its regression test.

## Verification

- Full local gate: `npm run release:verify` under Node 26.5.0 passes, including mobile/site/admin lint and typechecks, 4,417 workspace tests, and Expo configuration validation. One existing admin font warning remains.
- Focused plan gate under Node 22.23.2: 332 tests pass, zero failures or skips. Includes every plan's full offline enrollment/completion/persistence/removal lifecycle, every generated day, verse boundaries, localization keys, and recurring dates over two complete years.
- iOS bundle export succeeded. A separate iOS 26.5 simulator ran the current source through Metro using the existing native development shell. Observed corrected catalog labels, all seven exact Sermon assignments, Day 2 opening at highlighted Matthew 5:13, explicit completion returning to My Plans, and the corrected “1 read” count with Day 3 still incomplete after reload. The user's existing simulator and data were preserved.
- Local evidence: `qa-evidence/reading-plans-2026-09-12/` (ignored by Git).

## Limits

Audio playback remains chapter-based; verse-specific assignments open their first verse with the surrounding chapter available, and audio is not trimmed to the assigned verse range. This audit does not validate every remote translation/audio asset or constitute an Android device test or a store release.

The full Node 22 workspace suite still exposes unrelated asynchronous-test failures outside the focused plan gate. See the local Node 22 log before claiming the repository's CI gate is fully green.
