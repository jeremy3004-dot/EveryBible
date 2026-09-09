# EveryBible book icon production plan

## Approved direction

The user approved the Genesis, Exodus, and Leviticus line illustrations and requested the entire 66-book set, SVG delivery, theme adaptation, iPhone/Android compatibility, and small files for older Android phones. Numbered series share artwork: 57 unique designs. Keep the Gospel of John separate from the John letters. No decorative enclosing shields; Ephesians and Jude retain shields as their requested subject.

## Production

- [x] Generate the remaining 54 designs with the three approved images as style references. Preserve originals outside the app bundle.
- [x] Convert the monochrome drawings into actual vector paths with transparent backgrounds and currentColor. Keep each SVG below 20 KB and the unique set below 600 KB; inspect any unusually complex drawing.
- [x] Deliver all 66 mappings with shared references for numbered books. Provide a native SVG renderer using the existing react-native-svg dependency and theme foreground colors.
- [x] Build an offline preview with light/dark mode and small-size samples. Inspect every icon and verify complete coverage, aliases, file budgets, and absence of embedded raster data.
- [x] Run relevant lint, typechecks, and regression checks, and verify native platform exports if app consumers change. Report physical-device performance limits honestly.

No publishing or release is requested. Preserve unrelated workspace changes and existing original assets.
