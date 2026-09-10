# Quick Start Guide - Tibetan Illustrations

**Goal:** Generate 7 culturally appropriate Tibetan illustrations for EveryBible app

---

## 30-Second Overview

1. Copy prompts from `IMAGE_GENERATION_PROMPTS.md`
2. Generate on Midjourney/DALL-E/Leonardo.ai
3. Save to `originals/` directory
4. Run `./process-images.sh`
5. Test in app

---

## Copy-Paste Prompts (Ready for Midjourney)

### 1. home-hero.png
```
Tibetan family reading together in traditional stone house, colorful prayer flags through window, warm natural lighting, Himalayan mountains in misty background, Procreate digital illustration, warm paper texture, maroon and gold accents, no Buddhist religious symbols, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 2. field-entry.png
```
Tibetan shepherd in chuba robe tending sheep on green hillside, white stupa distant background, morning mist, sky blue and gold tones, Procreate illustration, warm atmosphere, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 3. field-gospel.png
```
Tibetan farmer sowing seeds in terraced fields with Himalayan peaks, traditional clothing, golden hour, prayer flags gently blowing, Procreate style, maroon and saffron gold colors, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 4. field-discipleship.png
```
Young Tibetan person studying scrolls in simple stone room, warm lamplight, traditional wooden table, peaceful learning, teal and brown tones, Procreate art, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 5. field-church.png
```
Tibetan community gathering for meal in courtyard, multiple generations, traditional clothing, warm amber tones, mountain monastery architecture in background not focus, joyful atmosphere, Procreate illustration, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 6. field-multiplication.png
```
Two Tibetan people walking on mountain path toward distant village, mentorship scene, deep purple and gold sunset, prayer flags on path, Procreate style, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

### 7. journey-complete.png
```
Tibetan celebration with colorful textiles, family gathering, warm firelight, mountains through doorway, gold and maroon colors, Procreate style, no religious iconography, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
```

---

## Critical: Cultural Check

Before saving ANY image, verify:

❌ **MUST NOT HAVE:**
- Buddhist idols/statues
- Tibetan independence flags
- Religious worship scenes

✅ **MUST HAVE:**
- Traditional chuba clothing
- Respectful representation
- Warm, inviting atmosphere

---

## After Generation

### 1. Save Files
```bash
cd /Users/dev/Projects/EveryBible/assets/tibetan
mkdir -p originals
# Move downloaded images to originals/ with exact names:
# - home-hero.png
# - field-entry.png
# - field-gospel.png
# - field-discipleship.png
# - field-church.png
# - field-multiplication.png
# - journey-complete.png
```

### 2. Process Images
```bash
# Install dependencies (one-time)
brew install imagemagick optipng

# Run processing script
./process-images.sh
```

This creates 21 files: 7 images × 3 resolutions (@1x, @2x, @3x)

### 3. Verify
```bash
# Check all files created
ls -lh *.png

# Should see:
# home-hero.png, home-hero@2x.png, home-hero@3x.png
# field-entry.png, field-entry@2x.png, field-entry@3x.png
# ... etc
```

---

## AI Service Quick Links

| Service | URL | Cost | Quality |
|---------|-----|------|---------|
| **Midjourney** | https://midjourney.com | $10/mo | ⭐⭐⭐⭐⭐ |
| **DALL-E 3** | https://chat.openai.com | $20/mo (ChatGPT+) | ⭐⭐⭐⭐ |
| **Leonardo.ai** | https://leonardo.ai | FREE 150/day | ⭐⭐⭐⭐ |
| **Adobe Firefly** | https://firefly.adobe.com | $5/mo | ⭐⭐⭐ |

**Recommendation:** Midjourney for best artistic quality

---

## Common Issues

### "Image has Buddhist statues"
→ Regenerate with: `--no buddhist statues, religious idols`

### "Wrong aspect ratio"
→ Check you included `--ar 16:9` flag

### "Style doesn't match"
→ Ensure "Procreate digital illustration" is in prompt

### "File size too large"
→ Script will optimize automatically

---

## React Native Usage

```typescript
import { TibetanIllustration } from './assets/tibetan/TibetanIllustrationExample';

// Simple usage
<TibetanIllustration asset="homeHero" />

// With custom size
<TibetanIllustration
  asset="fieldGospel"
  width={300}
  borderRadius={12}
/>
```

---

## Need More Details?

- **Full prompts:** `IMAGE_GENERATION_PROMPTS.md`
- **Step-by-step:** `EXTERNAL_GENERATION_GUIDE.md`
- **Cultural review:** `cultural-review-checklist.md`
- **Project overview:** `README.md`
- **Complete summary:** `PROJECT_SUMMARY.md`

---

## Time Estimate

- **Generation:** 2-4 hours (with iterations)
- **Processing:** 5 minutes (automated)
- **Total:** Half-day project

---

## Success = 21 Files

```
✅ home-hero.png, @2x, @3x
✅ field-entry.png, @2x, @3x
✅ field-gospel.png, @2x, @3x
✅ field-discipleship.png, @2x, @3x
✅ field-church.png, @2x, @3x
✅ field-multiplication.png, @2x, @3x
✅ journey-complete.png, @2x, @3x
```

**All under target file sizes, culturally appropriate, ready for production.**

---

**Start here:** https://midjourney.com → Copy prompt #1 → Generate → Review → Repeat for 6 more images

**Questions?** Read `EXTERNAL_GENERATION_GUIDE.md` for detailed instructions.
