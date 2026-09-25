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
