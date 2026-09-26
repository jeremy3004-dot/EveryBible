# Bundled Background Music Sources

These files are bundled into EveryBible for offline listen-mode background audio.

The app loops each track by crossfading the end of one copy into the start of the next, so a
track must sound at full level right to both ends. Piano, harp, soft guitar and ocean waves are
rebuilt from their originals by `scripts/audio/build_background_music.py` (leading silence and
fade-out endings cut at the least audible loop point, levelled to -20 LUFS / -1.5 dBTP, AAC
80 kbps). Playback volumes in `src/services/audio/backgroundMusicCatalog.ts` are matched to each
file's loudness. Every track is credited on the About screen.

## Ambient

- Bundled file: `ambient.m4a`
- Derived from: `Cleyton RX - Underwater_0.mp3`
- Source page: <https://opengameart.org/content/underwater-theme>
- Original author: `Cleyton Kauffman`
- License: `CC0`
- Source page attribution notice: `Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman`
- Shipping note: source is advertised as looped; runtime playback overlaps the end and start with a short crossfade to avoid an audible loop boundary.

## Piano

- Bundled file: `piano.m4a`
- Derived from: `003_Vaporware_2.mp3` (1.5 s of leading silence and the final 7 s, where the closing chord rings out, removed)
- Source page: <https://opengameart.org/content/calm-piano-1-vaporware>
- Original author: `cynicmusic / The Cynic Project`
- License: `CC0`
- Source page attribution notice: `ATTRIBUTION: The Cynic Project / cynicmusic.com / pixelsphere.org`

## Soft Guitar

- Bundled file: `soft-guitar.m4a`
- Derived from: `Etirwer (Looped)_0.ogg` (first 1.2 s and the final 6.8 s, including its fade-out, removed)
- Source page: <https://opengameart.org/content/etirwer>
- Original author: `Kistol`
- License: `CC0`

## Harp

- Bundled file: `harp.m4a`
- Derived from: `025_A_New_Town.mp3` (first 1.4 s and the final 6.5 s, where the theme dies away, removed)
- Source page: <https://opengameart.org/content/a-new-town-rpg-theme>
- Original author: `cynicmusic / The Cynic Project`
- License: `CC0`
- Source page attribution notice: `Please credit -- The Cynic Project / pixelsphere.org / cynicmusic.com`

## Flute

- Bundled file: `flute.m4a`
- Derived from: `ThroughSea.ogg`
- Source page: <https://opengameart.org/content/through-fire-through-sea-violin-flute-loop>
- Original author: `KiluaBoy`
- License: `CC0`
- Source page attribution notice: `To Kilua Boy, only if you want to help me :)`

## Sitar

- Bundled file: `sitar.m4a`
- Derived from: `Simple Desert.ogg`
- Source page: <https://opengameart.org/content/simple-desert>
- Original author: `Spring Spring`
- License: `CC-BY 3.0`
- Shipping note: this is the only bundled background-music source in this pack that requires attribution

## Ocean Waves

- Bundled file: `ocean-waves.m4a`
- Built from eight single-wave recordings, laid over each other at irregular times, levels and
  stereo positions above a synthesised soft wash, as a 90 s loop with no seam. (The previous
  file was one 3.5 s wave repeated 15 times with half a second of silence between.)
- Derived from: `wave_01`-`wave_04_cc0-18363__jasinski__alkaibeach.flac`
  - Source page: <https://opengameart.org/content/beach-ocean-waves>
  - Original author: `jasinski` (submitted to OpenGameArt by `qubodup`)
  - License: `CC0`
- Derived from: `wave_01`-`wave_04_cc0-11505__transitking__wavesound.flac`
  - Source page: <https://opengameart.org/content/water-waves>
  - Original author: `transitking` (extracted from freesound.org sound 11505)
  - License: `CC0`

# Streamed Background Sounds

These are not bundled. They live in R2 (bucket `everybibleapp`, served at
`https://media.everybible.app/background-sounds/v1/<id>.m4a`), are downloaded the first time a
listener plays one, and then play offline from disk. They are built by
`scripts/audio/build_background_sounds.py` (field recordings: the steadiest 3-minute stretch,
peaks softened; music: leading silence and ring-out cut; all levelled to -20 LUFS / -1.5 dBTP
where the recording allows, AAC 80 kbps). Uploaded 2026-09-26. Every sound is open-licensed;
the three attribution sounds and the share-alike hymn medley are credited on the About screen.

Freesound items were taken from Freesound's public full-length previews (Ogg, about 180 kbps),
since the original files need an account. Each licence below was read on the item's own page.

| Sound | Source | Author / performer | Licence |
|---|---|---|---|
| `rain` | "Rain Slowly Passing TREATED LOOP", <https://freesound.org/people/speakwithanimals/sounds/525046/> (2:14–5:14 used) | speakwithanimals | CC0 |
| `gentle-breeze` | "forest ambience constant breeze", <https://freesound.org/people/kyles/sounds/637559/> | kyles | CC0 |
| `summer-night` | "Quiet Night Atmosphere – Soft Crickets", <https://freesound.org/people/Goldenboy76/sounds/857163/> (1:36–4:36 used) | Goldenboy76 | CC0 |
| `waterfall` | "Hidden waterfall", <https://freesound.org/people/BassmanJourney/sounds/632107/> | BassmanJourney | CC0 |
| `birdsong` | "Birdsong in the bush", <https://freesound.org/people/dr19/sounds/457652/> (0:05–3:05 used) | dr19 | CC0 |
| `shore` | "Gentle waves on a lake", <https://freesound.org/people/TheFlyFishingFilmmaker/sounds/614299/> | TheFlyFishingFilmmaker | CC0 |
| `fireplace` | "Aachen_Burning Fireplace Crackling Fire Sounds", <https://freesound.org/people/visionear/sounds/501417/> (0:05–3:05 used) | visionear | CC0 |
| `church-bells` | "Bells french distant", <https://freesound.org/people/lazymonk/sounds/413157/> (2:53–5:53 used) | lazymonk | CC0 |
| `village` | "Perves Ambient Mountains Distant Small Village", <https://freesound.org/people/jordir/sounds/587370/> (6:58–9:58 used) | jordir | CC0 |
| `garden` | "Ambience, garden, afternoon, summer, Foggy, Ordrup", <https://freesound.org/people/Matmorfus/sounds/204711/> (0:43–3:43 used) | Matmorfus | CC0 |
| `wilderness` | "Forest Ambience 1", <https://freesound.org/people/Fester993/sounds/564436/> (0:00–2:23 used; a vehicle passes near the end of the original) | Fester993 | CC0 |
| `gregorian-chant` | Sequence "Victimae Paschali Laudes", <https://commons.wikimedia.org/wiki/File:The_Tudor_Consort_-_09_-_Sequence_-_Victimae_Paschali_Laudes.ogg> (also on the Free Music Archive under the same licence) | The Tudor Consort | CC-BY 3.0 |
| `organ` | J. S. Bach, Adagio from BWV 564, Steinmeyer organ of St. Michaelis, Hamburg, <https://commons.wikimedia.org/wiki/File:J.S.Bach_-_Adagio_(BWV_564).ogg> (source file is ~50 kbps) | Kerstin Wolf | CC-BY 3.0 |
| `piano-cello` | Chopin, Cello Sonata Op. 65, III. Largo, Musopen "Set Chopin Free", <https://commons.wikimedia.org/wiki/File:Chopin_-_Cello_Sonata_in_G_minor,_Op._65_-_III._Largo_(Christopher_Harding,_Yeonjin_Kim).flac> | Christopher Harding (piano), Yeonjin Kim (cello) | Public domain (also CC0 on archive.org) |
| `hymns` | Medley of four public-domain hymn tunes on pipe organ, each levelled and joined with a 1.5 s crossfade: EVENTIDE <https://commons.wikimedia.org/wiki/File:Eventide.ogg> and TOPLADY <https://commons.wikimedia.org/wiki/File:Toplady.ogg> (The Uninvited Co., Inc., CC-BY-SA 2.5); "When I Survey" <https://commons.wikimedia.org/wiki/File:When_I_Survey_Organ.oga> and "There is a green hill" <https://commons.wikimedia.org/wiki/File:There_is_a_green_hill_Organ.oga> (RandomCanadian, CC-BY-SA 4.0) | The Uninvited Co., Inc.; RandomCanadian | CC-BY-SA 4.0 (the medley, as the later compatible version of both share-alike licences) |

Not used after review: a Moretti organ "Elevation" on Commons (the page releases only the
composition, not the recording), a Silos monks Mass recording (may contain spoken parts), and a
35-minute Bavarian village dawn recording (rooster and traffic risk; the Catalan village above
is steadier).
