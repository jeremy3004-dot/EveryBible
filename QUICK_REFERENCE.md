# Tibetan Images - Quick Reference

## Current State ✅
- 3 illustrated images deployed in app
- Imagen 4 model working (not Imagen 3)
- Sequential generation confirmed working
- Images loaded at 1024×1024 resolution
- Icons now white in dark mode

## Proof This Works

```typescript
// WORKING prompt structure:
const prompt = `
  Illustrated characters wearing traditional Asian mountain clothing
  (maroon and gold robes),
  [scene description],
  friendly digital illustration style for mobile app,
  soft colors and simple character design,
  [theme],
  [background],
  clean modern illustration art
`;

// WORKING parameters:
{
  model: "imagen-4",
  person_generation: "allow_adult",  // CRITICAL!
  aspect_ratio: "1:1",
  number_of_images: 1
}
```

## If Images Don't Show

1. **Check file sizes:**
   ```bash
   ls -lh /Users/dev/Projects/EveryBible/assets/tibetan/*.png
   # Should be: 1.2M - 1.6M
   # NOT: 10K (that's the old placeholder)
   ```

2. **Delete old variants:**
   ```bash
   rm /Users/dev/Projects/EveryBible/assets/tibetan/*@2x.png
   rm /Users/dev/Projects/EveryBible/assets/tibetan/*@3x.png
   ```

3. **Nuclear cache clear:**
   ```bash
   rm -rf .expo ios/build node_modules/.cache
   rm -rf ~/Library/Developer/Xcode/DerivedData/EveryBible-*
   ```

4. **Rebuild:**
   ```bash
   npx expo run:ios --device "iPhone 17 Pro"
   ```

## Image Locations
- Base: `/Users/dev/Projects/EveryBible/assets/tibetan/`
- Files: `home-hero.png`, `field-gospel.png`, `field-discipleship.png`
- NO @2x or @3x variants (let React Native handle scaling)

## MCP Configuration
```json
{
  "gemini-imagen": {
    "command": "npx",
    "args": ["-y", "gemini-imagen-mcp-server"],
    "env": {
      "GEMINI_API_KEY": "AIzaSyC9hTtKTPJbdaKGJ1iaFPcafjTnNXCArjw"
    }
  }
}
```
**Note:** No `--batch` flag (doesn't work)

## For Future Generations

Use these exact working prompts:

### Family Scene:
```
Illustrated characters wearing traditional Asian mountain clothing (gold and maroon robes)
gathered in warm home interior studying scrolls, grandmother grandfather young woman young man,
ornate ceiling lamp, mountain landscape through windows, warm golden sunlight, family bonding,
high quality digital illustration, warm and inviting, no Buddhist symbols
```

### Prayer/Meditation:
```
Person in traditional Asian robe reading book by window, morning light, mountain view,
peaceful contemplation, warm colors, digital illustration, no Buddhist symbols
```

### Reconciliation:
```
Two people in robes showing reconciliation, outdoor mountain setting, warm sunlight,
forgiveness theme, digital illustration, no Buddhist symbols
```

## Success Indicators
- ✅ Images show illustrated people (not empty gradients)
- ✅ File size 1.2-1.6 MB (not 10KB)
- ✅ Timestamp Feb 5 19:08 or later (not 18:22)
- ✅ 1024×1024 resolution
- ✅ PNG format confirmed with `file` command

---

**Status:** Ready for production ✅
**Last Updated:** February 5, 2026
**Next Steps:** Monitor app performance, gather user feedback
