# External Image Generation Guide

Since AI image generation is not available in this development environment, follow this step-by-step guide to generate the 7 Tibetan illustrations using external services.

---

## Quick Start Checklist

- [ ] Choose generation service (Midjourney recommended)
- [ ] Copy all 7 prompts from IMAGE_GENERATION_PROMPTS.md
- [ ] Generate images at 16:9 aspect ratio
- [ ] Review against cultural guidelines
- [ ] Save to `originals/` directory
- [ ] Run `process-images.sh` script
- [ ] Complete cultural review checklist
- [ ] Test in React Native app

---

## Option 1: Midjourney (Recommended)

**Best for:** Artistic Procreate-style illustrations with consistent quality

### Setup (One-time)

1. Subscribe to Midjourney:
   - Go to https://www.midjourney.com
   - Choose Basic plan ($10/month) or Standard ($30/month)
   - Join Discord server or use web interface

2. Learn basic commands:
   - `/imagine` - Generate image
   - `--ar 16:9` - Set aspect ratio
   - `--style raw` - More artistic, less photorealistic
   - `--quality 2` - Higher detail (uses 2x GPU time)

### Generation Workflow

**For each of the 7 prompts:**

1. Open Midjourney (Discord or web)

2. Type `/imagine prompt:` followed by the prompt, e.g.:
   ```
   /imagine prompt: Tibetan family reading together in traditional stone house, colorful prayer flags through window, warm natural lighting, Himalayan mountains in misty background, Procreate digital illustration, warm paper texture, maroon and gold accents, no Buddhist religious symbols, 16:9 aspect ratio --ar 16:9 --style raw --quality 2
   ```

3. Wait for 4 variations to generate (60-120 seconds)

4. Review variations:
   - Check for prohibited elements (Buddhist idols, flags)
   - Verify cultural appropriateness
   - Assess artistic quality

5. Select best variation:
   - Click `U1`, `U2`, `U3`, or `U4` to upscale chosen image
   - Wait for full resolution (2048x1152 or higher)

6. Download upscaled image:
   - Right-click image > Save As
   - Name exactly as specified (e.g., `home-hero.png`)
   - Save to `originals/` directory

7. If result isn't perfect:
   - Use `Vary (Strong)` or `Vary (Subtle)` buttons
   - Or use `/imagine` again with modified prompt
   - Add `--no buddhist idols, flags` to exclude unwanted elements

**Repeat for all 7 images.**

### Midjourney Tips

- **Consistency:** Generate all images in same session for style consistency
- **Prohibitions:** Add `--no buddhist statues, religious idols, tibetan flags` if needed
- **Style matching:** Save your first good result as a style reference with `--sref`
- **Batch processing:** Generate multiple at once in different channels

### Cost Estimate

- Basic Plan: ~200 images/month = $10 (enough for this project)
- Standard Plan: Unlimited in relaxed mode = $30

---

## Option 2: DALL-E 3 (via ChatGPT Plus)

**Best for:** Cultural accuracy and following detailed instructions

### Setup

1. Subscribe to ChatGPT Plus ($20/month)
   - Go to https://chat.openai.com
   - Upgrade to Plus

2. Access DALL-E 3 in ChatGPT

### Generation Workflow

1. Start new ChatGPT conversation

2. Give initial context:
   ```
   I need to generate 7 Tibetan cultural illustrations for a mobile app.
   Each should be:
   - 16:9 landscape aspect ratio (1792x1024)
   - Procreate digital illustration style
   - Culturally appropriate (NO Buddhist idols, NO Tibetan flags)
   - Warm, inviting atmosphere

   I'll provide each prompt one at a time. Ready?
   ```

3. For each image, paste the prompt from IMAGE_GENERATION_PROMPTS.md

4. Review generated image:
   - Check cultural appropriateness
   - Verify no prohibited elements
   - Assess quality

5. If revision needed, say:
   ```
   Please regenerate without [specific element] and emphasize [desired element]
   ```

6. Download image:
   - Click on image to expand
   - Click download button
   - Rename to exact filename (e.g., `home-hero.png`)
   - Save to `originals/` directory

**Repeat for all 7 images.**

### DALL-E 3 Tips

- **Specificity:** DALL-E follows prompts closely - be very specific about what to avoid
- **Iterations:** You can ask for modifications without regenerating from scratch
- **Cultural sensitivity:** DALL-E has built-in cultural awareness, good for this project
- **Limitations:** Limited to 50 images per 3 hours on Plus plan

---

## Option 3: Leonardo.ai

**Best for:** Budget-conscious option with free tier

### Setup

1. Create account at https://leonardo.ai
2. Free tier: 150 credits/day (1 image = ~1-2 credits)

### Generation Workflow

1. Select "Image Generation" from dashboard

2. Choose model:
   - "Leonardo Diffusion XL" for best quality
   - Or "Leonardo Kino XL" for more cinematic look

3. Settings:
   - **Dimensions:** Custom > 1920x1080 or 1792x1024
   - **Style:** Digital Art or Illustration
   - **Quality:** High

4. Paste prompt in text box (copy from IMAGE_GENERATION_PROMPTS.md)

5. Optional: Add negative prompt:
   ```
   buddhist idols, religious statues, tibetan flags, political symbols, temples, worship scenes
   ```

6. Click "Generate" (costs 1-2 credits)

7. Review results (generates 4 variations)

8. Click download on best variation

9. Rename and save to `originals/` directory

**Repeat for all 7 images.**

### Leonardo.ai Tips

- **Free tier:** 150 credits/day = ~75-150 images
- **Consistent style:** Use "Prompt Magic" for better quality
- **Upscaling:** Use built-in upscaler if needed (extra credits)
- **Batch mode:** Generate multiple in sequence

---

## Option 4: Adobe Firefly

**Best for:** Commercial licensing and Adobe ecosystem integration

### Setup

1. Go to https://firefly.adobe.com
2. Sign in with Adobe ID (free tier available)

### Generation Workflow

1. Select "Text to Image"

2. Paste prompt from IMAGE_GENERATION_PROMPTS.md

3. Settings:
   - **Aspect Ratio:** Landscape (16:9)
   - **Content Type:** Art
   - **Style:** Illustration > Digital Illustration

4. Click "Generate"

5. Review 4 variations

6. Click best result, then "Download"

7. Rename and save to `originals/` directory

**Repeat for all 7 images.**

### Adobe Firefly Tips

- **Free tier:** 25 generations/month
- **Paid tier:** $4.99/month for 100 generations
- **Commercial use:** All Firefly images are safe for commercial use
- **Style reference:** Upload your own style reference for consistency

---

## After Generation: Processing Steps

### 1. Organize Files

```bash
cd /Users/dev/Projects/EveryBible/assets/tibetan
mkdir -p originals
# Move all downloaded images to originals/
mv ~/Downloads/home-hero.png originals/
mv ~/Downloads/field-*.png originals/
mv ~/Downloads/journey-complete.png originals/
```

### 2. Verify All Files Present

```bash
ls -1 originals/
```

Should show:
```
field-church.png
field-discipleship.png
field-entry.png
field-gospel.png
field-multiplication.png
home-hero.png
journey-complete.png
```

### 3. Cultural Review

Open `cultural-review-checklist.md` and review each image:

```bash
open cultural-review-checklist.md
```

Check EVERY image for:
- [ ] NO Buddhist idols visible
- [ ] NO Tibetan independence flags
- [ ] Monasteries/stupas background only
- [ ] People in traditional clothing
- [ ] Respectful representation

### 4. Process Images

Run the processing script to generate all variants:

```bash
# Install dependencies if needed
brew install imagemagick optipng

# Run processing
./process-images.sh
```

This generates:
- `home-hero.png` (1920x1080 - @1x)
- `home-hero@2x.png` (3840x2160 - @2x)
- `home-hero@3x.png` (5760x3240 - @3x)
- ...and same for all 7 images

### 5. Verify File Sizes

```bash
ls -lh *.png | grep -v originals
```

Check that @1x versions are under 500KB each.

### 6. Test in App

```typescript
// In your React Native component
import { TIBETAN_ASSETS } from './assets/tibetan/TibetanIllustrationExample';

<TibetanIllustration asset="homeHero" />
```

Run on both iOS and Android to verify:
- Images load correctly
- Aspect ratio maintained
- Resolution appropriate for device
- No performance issues

---

## Troubleshooting

### Image has Buddhist idols or flags

**Solution:** Regenerate with stronger prohibition:
- Midjourney: Add `--no buddhist statues, idols, religious symbols, tibetan flags`
- DALL-E: "Please remove all Buddhist religious symbols and Tibetan flags"
- Leonardo/Firefly: Add to negative prompt

### Image doesn't match Procreate style

**Solution:**
- Midjourney: Use `--style raw` and add "Procreate digital illustration, painterly"
- DALL-E: Emphasize "Procreate iPad illustration, digital painting style"
- Add reference to "warm paper texture" and "hand-drawn feel"

### Colors are too dark/bright

**Solution:** Modify prompt with specific color direction:
- "Warm, inviting color palette"
- "Bright but not oversaturated"
- "Earthy tones with maroon and gold accents"

### Aspect ratio is wrong

**Solution:**
- Midjourney: Ensure `--ar 16:9` flag is included
- DALL-E: Request "landscape orientation, 16:9 aspect ratio"
- Leonardo: Set custom dimensions to 1920x1080
- Firefly: Select "Landscape (16:9)" in settings

### File size too large

**Solution:**
```bash
# Additional compression
pngquant --quality=80-95 originals/home-hero.png -o home-hero-compressed.png

# Or use online tools
# - TinyPNG.com
# - Squoosh.app
# - ImageOptim (Mac app)
```

---

## Cost Summary

| Service | Free Tier | Paid Tier | Best For |
|---------|-----------|-----------|----------|
| **Midjourney** | ❌ No | $10/mo (200 images) | Artistic quality |
| **DALL-E 3** | ❌ No | $20/mo (ChatGPT Plus) | Instruction following |
| **Leonardo.ai** | ✅ 150 credits/day | $10/mo | Budget option |
| **Adobe Firefly** | ✅ 25/mo | $4.99/mo (100 images) | Commercial licensing |

**Recommendation:**
- **Budget:** Start with Leonardo.ai free tier
- **Quality:** Midjourney Standard ($30/mo) for best results
- **All-in-one:** ChatGPT Plus if you already have subscription

---

## Support

If you encounter issues:

1. **Check prompts:** Review IMAGE_GENERATION_PROMPTS.md for exact wording
2. **Review examples:** Each service has a gallery of good examples
3. **Cultural review:** Always complete checklist before finalizing
4. **Community help:** Post in service-specific Discord/forums

**Questions?** Create an issue in the project repository.

---

**Next Steps After Completion:**

1. ✅ All 7 images generated and saved
2. ✅ Cultural review checklist completed
3. ✅ Images processed (@1x, @2x, @3x variants)
4. ✅ File sizes optimized (<500KB for @1x)
5. ✅ Tested in React Native app
6. ✅ Ready for production use

**Final deliverables location:**
```
/Users/dev/Projects/EveryBible/assets/tibetan/
├── home-hero.png, @2x.png, @3x.png
├── field-entry.png, @2x.png, @3x.png
├── field-gospel.png, @2x.png, @3x.png
├── field-discipleship.png, @2x.png, @3x.png
├── field-church.png, @2x.png, @3x.png
├── field-multiplication.png, @2x.png, @3x.png
└── journey-complete.png, @2x.png, @3x.png
```
