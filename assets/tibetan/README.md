# Tibetan Illustrations for EveryBible App

This directory contains culturally appropriate Tibetan-style illustrations for the field tracking journey feature.

## Overview

**Total Images:** 7
**Style:** Procreate digital illustration with warm paper texture
**Aspect Ratio:** 16:9 (optimized for mobile landscape viewing)
**Target File Size:** <500KB per @1x image
**Format:** PNG (with optional WebP variants)

## Image Set

| Filename | Usage | Description | Color Palette |
|----------|-------|-------------|---------------|
| `home-hero.png` | Home screen hero | Family reading in traditional home | Maroon, gold, warm earth |
| `field-entry.png` | Entry stage | Shepherd with sheep on hillside | Sky blue, gold, green |
| `field-gospel.png` | Gospel stage | Farmer sowing seeds | Maroon, saffron gold |
| `field-discipleship.png` | Discipleship stage | Young person studying | Teal, brown, warm lamp |
| `field-church.png` | Church stage | Community meal gathering | Warm amber, earth tones |
| `field-multiplication.png` | Multiplication stage | Mentorship journey on mountain path | Deep purple, gold, sunset |
| `journey-complete.png` | Completion celebration | Family celebration | Gold, maroon, firelight |

## Cultural Guidelines

### ✅ Approved Elements
- Tibetan people in traditional chuba robes
- Himalayan landscapes and mountain scenery
- Monastery architecture (background only, not worship focus)
- Prayer wheels and flags (decorative, background elements)
- Traditional textiles and cultural elements
- Stone houses and authentic architecture

### ❌ Prohibited Elements
- Buddhist deity statues or religious idols
- Tibetan independence flags or political symbols
- Temples/monasteries as primary focus or worship scenes
- Religious ceremony depictions
- Any politically sensitive imagery

## Files in This Directory

```
tibetan/
├── README.md                           # This file
├── IMAGE_GENERATION_PROMPTS.md         # Complete prompts for AI generation
├── cultural-review-checklist.md        # Quality assurance checklist
├── asset-manifest.json                 # Asset metadata and specifications
├── process-images.sh                   # Bash script for image optimization
├── originals/                          # (Create this) Place source images here
│   ├── home-hero.png
│   ├── field-entry.png
│   ├── field-gospel.png
│   ├── field-discipleship.png
│   ├── field-church.png
│   ├── field-multiplication.png
│   └── journey-complete.png
└── [Generated variants will be here]
    ├── home-hero.png                   # @1x (1920x1080)
    ├── home-hero@2x.png                # @2x (3840x2160)
    ├── home-hero@3x.png                # @3x (5760x3240)
    └── ...
```

## Generation Workflow

Since direct AI image generation is not available in this environment, follow these steps:

### 1. Generate Images Externally

Use one of these services with the prompts in `IMAGE_GENERATION_PROMPTS.md`:

**Recommended Services:**
- **Midjourney** (Best for artistic Procreate style)
  - Use Discord bot or web interface
  - Add `--ar 16:9` flag to all prompts
  - Use `--style raw` for painterly feel
  - Generate at highest quality

- **DALL-E 3** (via ChatGPT Plus)
  - Good for cultural accuracy
  - Request 1792x1024 landscape format
  - May need multiple iterations

- **Adobe Firefly**
  - Good commercial licensing
  - Select "Digital Illustration" style preset
  - Generate at highest resolution

- **Leonardo.ai**
  - Free tier available
  - Specify "Procreate" or "digital painting" style

### 2. Place Source Images

1. Create `originals/` directory:
   ```bash
   mkdir -p /Users/dev/Projects/EveryBible/assets/tibetan/originals
   ```

2. Save all 7 generated images to `originals/` with exact names:
   - `home-hero.png`
   - `field-entry.png`
   - `field-gospel.png`
   - `field-discipleship.png`
   - `field-church.png`
   - `field-multiplication.png`
   - `journey-complete.png`

### 3. Cultural Review

1. Open `cultural-review-checklist.md`
2. Review each image against criteria
3. Check for prohibited elements
4. Verify cultural appropriateness
5. Document any needed revisions

### 4. Process Images

Run the processing script to generate @1x, @2x, @3x variants:

```bash
cd /Users/dev/Projects/EveryBible/assets/tibetan
./process-images.sh
```

**Requirements:**
- ImageMagick: `brew install imagemagick`
- optipng (optional): `brew install optipng`

This script will:
- Generate three resolution variants for each image
- Optimize PNG file sizes
- Report file sizes and warn if >500KB
- Create all files in the tibetan/ directory

### 5. React Native Integration

#### Import in JavaScript/TypeScript:

```typescript
import { Image } from 'react-native';

// For automatic resolution selection
const homeHero = require('./assets/tibetan/home-hero.png');

<Image
  source={homeHero}
  style={{ width: '100%', aspectRatio: 16/9 }}
  resizeMode="cover"
/>
```

#### With TypeScript types:

```typescript
// types/assets.d.ts
declare module '*.png' {
  const value: any;
  export default value;
}
```

#### Using with Expo Image:

```typescript
import { Image } from 'expo-image';

<Image
  source={require('./assets/tibetan/home-hero.png')}
  style={{ width: '100%', aspectRatio: 16/9 }}
  contentFit="cover"
  transition={200}
/>
```

### 6. Testing Checklist

- [ ] Test on iOS device (verify @2x and @3x selection)
- [ ] Test on Android device (verify @2x and @3x selection)
- [ ] Verify images load quickly (<2s on 3G)
- [ ] Check memory usage doesn't spike
- [ ] Verify aspect ratio maintained across devices
- [ ] Test in landscape and portrait orientations
- [ ] Verify colors display correctly on OLED and LCD screens

## Optimization Tips

### If file sizes are too large:

1. **Reduce dimensions slightly** (5% won't be noticeable)
2. **Use WebP format** for better compression:
   ```bash
   cwebp -q 85 home-hero.png -o home-hero.webp
   ```
3. **Apply additional PNG compression**:
   ```bash
   pngquant --quality=85-95 home-hero.png
   ```

### For React Native performance:

1. Use `expo-asset` to pre-cache images on app load
2. Implement lazy loading for images below the fold
3. Consider using `FastImage` library for better caching
4. Monitor bundle size with `npx react-native-bundle-visualizer`

## Cultural Validation

Before final release, recommended steps:

1. **Internal Review:** Complete cultural-review-checklist.md
2. **Community Feedback:** Show images to Tibetan community members
3. **Cultural Consultant:** Hire expert if budget allows
4. **Sensitivity Training:** Ensure team understands cultural context
5. **Ongoing Monitoring:** Collect user feedback post-launch

## Support & Questions

For questions about:
- **Image generation prompts:** See `IMAGE_GENERATION_PROMPTS.md`
- **Cultural guidelines:** See `cultural-review-checklist.md`
- **Technical specs:** See `asset-manifest.json`
- **Processing script:** Run `./process-images.sh --help`

## License & Attribution

**Important:** Ensure all generated images:
- Have proper commercial usage rights
- Credit the AI service used (if required)
- Comply with service terms of use
- Are cleared for distribution in mobile apps

Document attribution here:
```
[Add image attribution and licensing details after generation]
```

---

**Last Updated:** 2026-02-05
**Status:** Ready for image generation
**Next Step:** Generate images using external AI service
