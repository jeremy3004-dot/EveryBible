# Tibetan Illustrations Project Summary

**Project:** EveryBible App - Culturally Appropriate Tibetan Illustration Assets
**Date:** 2026-02-05
**Status:** Ready for External Generation

---

## Project Overview

This project prepares all necessary documentation, tooling, and workflows to generate 7 culturally appropriate Tibetan-style illustrations for the EveryBible mobile app's field tracking journey feature.

### Why This Approach?

Direct AI image generation tools (Midjourney, DALL-E, Gemini Imagen) are not available in this development environment. Therefore, this project provides:

1. **Complete generation prompts** ready to copy/paste into external services
2. **Cultural review framework** to ensure appropriateness
3. **Processing automation** to create multi-resolution variants
4. **React Native integration** examples for immediate use

---

## Deliverables

### 1. Documentation Files

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project overview and workflow guide | ✅ Complete |
| `IMAGE_GENERATION_PROMPTS.md` | 7 exact prompts for AI generation | ✅ Complete |
| `EXTERNAL_GENERATION_GUIDE.md` | Step-by-step generation instructions | ✅ Complete |
| `cultural-review-checklist.md` | Quality assurance framework | ✅ Complete |
| `asset-manifest.json` | Asset metadata and specifications | ✅ Complete |
| `PROJECT_SUMMARY.md` | This file | ✅ Complete |

### 2. Automation Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `process-images.sh` | Generate @1x/@2x/@3x variants and optimize | ✅ Complete |

**Requirements:** ImageMagick, optipng (optional)

### 3. Code Examples

| File | Purpose | Status |
|------|---------|--------|
| `TibetanIllustrationExample.tsx` | React Native component examples | ✅ Complete |

Includes:
- Reusable `<TibetanIllustration>` component
- Preloading utility
- Lazy loading implementation
- Usage examples

### 4. Directory Structure

```
/Users/dev/Projects/EveryBible/assets/tibetan/
├── README.md                           ✅ Overview and workflow
├── IMAGE_GENERATION_PROMPTS.md         ✅ AI prompts
├── EXTERNAL_GENERATION_GUIDE.md        ✅ Generation instructions
├── cultural-review-checklist.md        ✅ QA checklist
├── asset-manifest.json                 ✅ Asset metadata
├── PROJECT_SUMMARY.md                  ✅ This summary
├── process-images.sh                   ✅ Processing script
├── TibetanIllustrationExample.tsx      ✅ React Native examples
└── originals/                          📁 (Create: place generated images here)
```

---

## The 7 Images

| # | Filename | Purpose | Key Elements |
|---|----------|---------|--------------|
| 1 | `home-hero.png` | Home screen hero | Family reading, traditional home, mountains |
| 2 | `field-entry.png` | Entry stage | Shepherd with sheep, hillside, stupa background |
| 3 | `field-gospel.png` | Gospel stage | Farmer sowing seeds, terraced fields |
| 4 | `field-discipleship.png` | Discipleship stage | Young person studying, stone room |
| 5 | `field-church.png` | Church stage | Community gathering, courtyard meal |
| 6 | `field-multiplication.png` | Multiplication stage | Mentorship journey, mountain path |
| 7 | `journey-complete.png` | Completion | Celebration, family, colorful textiles |

**Specifications:**
- **Style:** Procreate digital illustration, warm paper texture
- **Aspect Ratio:** 16:9 (landscape)
- **Resolution:** 1920x1080 minimum (@1x), higher for @2x and @3x
- **File Size Target:** <500KB per @1x image after optimization
- **Format:** PNG (primary), WebP (optional alternative)

---

## Cultural Guidelines

### ✅ Approved Elements
- Tibetan people in traditional chuba robes
- Himalayan landscapes and mountain scenery
- Monastery architecture (background only)
- Prayer wheels and flags (decorative background)
- Traditional textiles and cultural elements
- Authentic stone house architecture

### ❌ Prohibited Elements
- Buddhist deity statues or religious idols
- Tibetan independence flags or political symbols
- Temples/monasteries as primary focus
- Religious worship or ceremony scenes
- Any politically sensitive imagery

**Critical:** Every generated image MUST be reviewed against these guidelines before approval.

---

## Workflow Summary

### Phase 1: External Generation (You Are Here)

1. **Choose AI service:**
   - Midjourney (recommended for quality)
   - DALL-E 3 (via ChatGPT Plus)
   - Leonardo.ai (free tier available)
   - Adobe Firefly (commercial licensing)

2. **Generate 7 images:**
   - Copy prompts from `IMAGE_GENERATION_PROMPTS.md`
   - Generate each image at 16:9 aspect ratio
   - Review for cultural appropriateness
   - Download and rename to exact filenames

3. **Save to originals directory:**
   ```bash
   mkdir -p originals
   # Move downloaded images here
   ```

### Phase 2: Cultural Review

1. Open `cultural-review-checklist.md`
2. Review each image systematically
3. Check for prohibited elements
4. Document any needed revisions
5. Regenerate if necessary

### Phase 3: Processing

1. Install dependencies:
   ```bash
   brew install imagemagick optipng
   ```

2. Run processing script:
   ```bash
   ./process-images.sh
   ```

3. Verify output:
   - 21 files generated (7 images × 3 resolutions)
   - @1x files under 500KB each
   - All images maintain 16:9 aspect ratio

### Phase 4: Integration

1. Import in React Native:
   ```typescript
   import { TibetanIllustration } from './assets/tibetan/TibetanIllustrationExample';

   <TibetanIllustration asset="homeHero" />
   ```

2. Test on devices:
   - iOS (verify @2x/@3x selection)
   - Android (verify @2x/@3x selection)
   - Performance monitoring

3. Deploy to production

---

## Cost Estimates

| Service | Cost | Images Included | Best For |
|---------|------|-----------------|----------|
| **Midjourney Basic** | $10/mo | ~200 | Quality + iterations |
| **ChatGPT Plus** | $20/mo | ~50 per 3hrs | Cultural accuracy |
| **Leonardo.ai Free** | $0 | 150/day | Budget testing |
| **Adobe Firefly** | $4.99/mo | 100 | Commercial rights |

**Recommendation for this project:**
- Start with Leonardo.ai free tier for testing
- Use Midjourney Basic ($10) for final high-quality versions
- Budget: ~$10-20 total for all 7 images with iterations

---

## Technical Specifications

### Resolution Variants

| Variant | Resolution | Use Case | File Size Target |
|---------|-----------|----------|------------------|
| @1x | 1920×1080 | Standard displays | <500KB |
| @2x | 3840×2160 | Retina displays | <1.5MB |
| @3x | 5760×3240 | iPhone Pro Max, iPad Pro | <3MB |

React Native automatically selects appropriate variant based on device pixel density.

### Color Palettes

| Image | Primary Colors | Mood |
|-------|---------------|------|
| home-hero | Maroon, gold, warm earth | Cozy, inviting |
| field-entry | Sky blue, gold, green | Peaceful, pastoral |
| field-gospel | Maroon, saffron gold | Hopeful, abundant |
| field-discipleship | Teal, brown, lamp warmth | Contemplative, focused |
| field-church | Warm amber, earth | Joyful, communal |
| field-multiplication | Deep purple, gold | Inspirational, journey |
| journey-complete | Gold, maroon, firelight | Celebratory, triumphant |

### Performance Targets

- **Initial load:** <2 seconds on 3G
- **Memory usage:** <50MB for all images cached
- **Bundle impact:** <5MB total (all @1x compressed)

---

## Testing Checklist

After generation and processing:

### Visual Quality
- [ ] All images have consistent Procreate illustration style
- [ ] Color palettes complement each other as a set
- [ ] 16:9 aspect ratio maintained across all images
- [ ] No visible compression artifacts
- [ ] Warm, inviting atmosphere achieved

### Cultural Appropriateness
- [ ] NO Buddhist idols in any image
- [ ] NO Tibetan independence flags in any image
- [ ] Monasteries/stupas background only
- [ ] Traditional clothing accurate
- [ ] Respectful representation of Tibetan culture

### Technical Requirements
- [ ] All @1x files under 500KB
- [ ] All @2x files under 1.5MB
- [ ] All @3x files under 3MB
- [ ] PNG format with transparency support
- [ ] Optimized with optipng or equivalent

### React Native Integration
- [ ] Images import correctly
- [ ] Aspect ratio preserved on iOS
- [ ] Aspect ratio preserved on Android
- [ ] No performance issues (memory, loading)
- [ ] TypeScript types work correctly

### Device Testing
- [ ] iPhone (standard resolution)
- [ ] iPhone Pro (high resolution)
- [ ] iPad
- [ ] Android phone (various densities)
- [ ] Android tablet

---

## Troubleshooting Guide

### Problem: Image has prohibited elements

**Solution:**
1. Regenerate with stronger prohibition in prompt
2. Add negative prompt: "buddhist idols, tibetan flags, religious symbols"
3. Review cultural guidelines and adjust prompt

### Problem: Wrong aspect ratio

**Solution:**
1. Check generation settings (must be 16:9)
2. Crop to 16:9 before processing
3. Regenerate with explicit `--ar 16:9` flag (Midjourney)

### Problem: File size too large

**Solution:**
1. Run additional compression:
   ```bash
   pngquant --quality=80-95 image.png -o image-compressed.png
   ```
2. Use online tools: TinyPNG.com, Squoosh.app
3. Consider WebP format for better compression

### Problem: Style inconsistency between images

**Solution:**
1. Generate all images in same session
2. Use style reference feature (Midjourney `--sref`)
3. Add "consistent Procreate illustration style" to all prompts
4. Regenerate outliers

### Problem: Processing script fails

**Solution:**
1. Verify ImageMagick installed: `convert --version`
2. Check file permissions: `chmod +x process-images.sh`
3. Ensure originals/ directory exists and has images
4. Check image filenames match exactly

---

## Future Enhancements

### Potential Additions
1. **WebP variants** for better compression
2. **Dark mode versions** with adjusted color palettes
3. **SVG overlays** for interactive elements
4. **Animated versions** for loading states
5. **Additional field stages** as app evolves

### Localization Considerations
If app expands to other cultural contexts:
- Nepali illustrations
- Bhutanese illustrations
- Mongolian illustrations
- Indian Himalayan regions

Use this project as template for future illustration sets.

---

## Contact & Support

### Questions About:

**Generation Prompts:**
- See `IMAGE_GENERATION_PROMPTS.md` for exact wording
- Modify prompts if AI service requires different format

**Cultural Guidelines:**
- See `cultural-review-checklist.md` for review criteria
- Consult with Tibetan community members when possible

**Technical Processing:**
- See `process-images.sh` script
- Check README.md for dependency installation

**React Native Integration:**
- See `TibetanIllustrationExample.tsx` for code examples
- Test on real devices before production

---

## Success Criteria

This project is considered successful when:

1. ✅ All 7 images generated with cultural appropriateness
2. ✅ Cultural review checklist completed with passing marks
3. ✅ All resolution variants generated (@1x, @2x, @3x)
4. ✅ File sizes optimized to targets
5. ✅ Images integrate successfully in React Native app
6. ✅ Testing completed on iOS and Android devices
7. ✅ No cultural concerns raised by Tibetan community reviewers

---

## Next Steps

**Immediate (You):**
1. Choose AI generation service (see EXTERNAL_GENERATION_GUIDE.md)
2. Generate first test image to verify style
3. If approved, generate remaining 6 images
4. Complete cultural review checklist
5. Run processing script
6. Test in app

**After Completion:**
1. Archive original high-resolution files
2. Update app with new assets
3. Gather user feedback
4. Iterate if necessary
5. Document lessons learned for future illustration projects

---

## Project Files Location

**Absolute path:** `/Users/dev/Projects/EveryBible/assets/tibetan/`

**Generated files will be:**
```
/Users/dev/Projects/EveryBible/assets/tibetan/home-hero.png
/Users/dev/Projects/EveryBible/assets/tibetan/home-hero@2x.png
/Users/dev/Projects/EveryBible/assets/tibetan/home-hero@3x.png
... (and 6 more image sets)
```

**Total deliverables:** 21 optimized image files (7 images × 3 resolutions)

---

**Project Status:** ✅ Ready for External Generation

**Estimated Time to Complete:**
- Generation: 2-4 hours (including iterations)
- Cultural review: 1-2 hours
- Processing: 5-10 minutes (automated)
- Integration testing: 1-2 hours
- **Total:** 4-8 hours

**Estimated Cost:**
- AI service: $0-20 (depending on service chosen)
- Development time: Already invested
- Cultural consultant (optional): Variable

---

**Document Version:** 1.0
**Last Updated:** 2026-02-05
**Author:** Claude (Frontend Developer Agent)
