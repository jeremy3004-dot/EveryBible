# App icon

`assets/icon-source.png` is the approved terracotta and cream hollow-cross artwork.
Run `node scripts/generate-icons.js` to regenerate the Expo, iOS, Android, and site icons.

The iOS and site icons preserve the source artwork. Android separates the cream
cross from a terracotta background (`#AD5942`) with padding for launcher masks.
Keep the matching adaptive background color in `app.json` synchronized with the
generator. Foreground extraction is specific to this artwork's cream palette.

The launch splash remains neutral to support discreet mode. Native launcher icon
changes take effect in a new app build.

The app theme also uses terracotta: `#D88D74` on dark surfaces and `#9F503B`
on light surfaces, with matching selected-tab fills. These shades retain readable
contrast on the existing warm backgrounds. The historical `el-blue` preference
ID stays unchanged for saved-settings compatibility; its swatches are terracotta.
