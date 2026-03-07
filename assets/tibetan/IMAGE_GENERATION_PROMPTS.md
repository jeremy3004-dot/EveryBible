# Tibetan Illustration Generation Prompts

**Project:** EveryBible App - Tibetan Field Asset Pack
**Style:** Procreate digital illustration, warm paper texture
**Aspect Ratio:** 16:9 (1920x1080 minimum)
**Cultural Constraints:** NO Buddhist idols, NO Tibetan independence flags, monasteries/stupas as background only

---

## 1. home-hero.png

**Prompt:**
```
Tibetan family reading together in traditional stone house, colorful prayer flags through window, warm natural lighting, Himalayan mountains in misty background, Procreate digital illustration, warm paper texture, maroon and gold accents, no Buddhist religious symbols, 16:9 aspect ratio, cozy interior scene, traditional chuba robes, warm earth tones
```

**Key Elements:**
- Family of 3-4 people in traditional clothing
- Stone interior with wooden beams
- Prayer flags visible through window (background)
- Warm, inviting atmosphere
- Mountains in distance through window

---

## 2. field-entry.png

**Prompt:**
```
Tibetan shepherd in chuba robe tending sheep on green hillside, white stupa distant background, morning mist, sky blue and gold tones, Procreate illustration, warm atmosphere, 16:9 aspect ratio, peaceful pastoral scene, traditional Tibetan clothing, soft lighting
```

**Key Elements:**
- Single shepherd figure in traditional chuba
- Flock of sheep grazing
- Rolling green hills
- Stupa barely visible in far background
- Morning mist creating depth

---

## 3. field-gospel.png

**Prompt:**
```
Tibetan farmer sowing seeds in terraced fields with Himalayan peaks, traditional clothing, golden hour, prayer flags gently blowing, Procreate style, maroon and saffron gold colors, 16:9 aspect ratio, agricultural scene, warm sunset lighting
```

**Key Elements:**
- Farmer in active sowing motion
- Terraced agricultural fields
- Himalayan mountain range backdrop
- Golden hour warm lighting
- Prayer flags on distant hillside

---

## 4. field-discipleship.png

**Prompt:**
```
Young Tibetan person studying scrolls in simple stone room, warm lamplight, traditional wooden table, peaceful learning, teal and brown tones, Procreate art, 16:9 aspect ratio, contemplative study scene, traditional clothing, intimate interior
```

**Key Elements:**
- Young adult focused on reading/studying
- Simple room with stone walls
- Wooden table with scrolls/books
- Single oil lamp or lantern light source
- Peaceful, contemplative mood

---

## 5. field-church.png

**Prompt:**
```
Tibetan community gathering for meal in courtyard, multiple generations, traditional clothing, warm amber tones, mountain monastery architecture in background not focus, joyful atmosphere, Procreate illustration, 16:9 aspect ratio, communal feast scene, diverse ages
```

**Key Elements:**
- 8-12 people of various ages
- Outdoor courtyard setting
- Shared meal/food preparation
- Monastery building in distant background
- Warm, joyful expressions and interactions

---

## 6. field-multiplication.png

**Prompt:**
```
Two Tibetan people walking on mountain path toward distant village, mentorship scene, deep purple and gold sunset, prayer flags on path, Procreate style, 16:9 aspect ratio, journey scene, traditional clothing, inspirational atmosphere
```

**Key Elements:**
- Two figures (mentor and student dynamic)
- Mountain trail leading to village
- Dramatic sunset colors
- Prayer flags lining the path
- Sense of purpose and journey

---

## 7. journey-complete.png

**Prompt:**
```
Tibetan celebration with colorful textiles, family gathering, warm firelight, mountains through doorway, gold and maroon colors, Procreate style, no religious iconography, 16:9 aspect ratio, festive celebration scene, traditional clothing and decorations
```

**Key Elements:**
- Celebratory gathering of family
- Colorful traditional textiles as decoration
- Fire or hearth as light source
- Doorway framing mountain view
- Joyful completion/achievement mood

---

## Generation Services Recommended

### Option 1: Midjourney (Recommended for artistic style)
- Best for Procreate-style illustrations
- Use `--ar 16:9` flag
- Use `--style raw` or `--style expressive` for painterly feel
- Add `--quality 2` for higher detail

### Option 2: DALL-E 3 (via ChatGPT Plus)
- Good for cultural accuracy
- Specify 1792x1024 landscape format
- May need to regenerate for specific details

### Option 3: Adobe Firefly
- Good commercial licensing
- Built-in style presets for digital illustration
- Generate at highest resolution available

### Option 4: Leonardo.ai
- Free tier available
- Good control over artistic style
- Can specify "Procreate" or "digital painting" style

---

## Cultural Review Checklist (Apply to ALL generated images)

### ✅ REQUIRED ELEMENTS
- [ ] Tibetan people in traditional chuba robes
- [ ] Himalayan landscape features
- [ ] Warm, inviting color palette
- [ ] Respectful cultural representation
- [ ] 16:9 aspect ratio maintained

### ❌ PROHIBITED ELEMENTS
- [ ] NO Buddhist deity statues/idols visible
- [ ] NO Tibetan independence flags (snow lions)
- [ ] NO temples/monasteries as primary focus
- [ ] NO religious worship scenes
- [ ] NO politically sensitive imagery

### 🔍 BACKGROUND ELEMENTS (Acceptable if subtle)
- [ ] Prayer wheels (decorative, not worship focus)
- [ ] Prayer flags (colorful, cultural element)
- [ ] Monastery architecture (distant background only)
- [ ] Stupas (distant landscape element)

---

## Post-Generation Processing

Once images are generated:

1. **Rename files** to match specification:
   - home-hero.png
   - field-entry.png
   - field-gospel.png
   - field-discipleship.png
   - field-church.png
   - field-multiplication.png
   - journey-complete.png

2. **Optimize for mobile**:
   - Generate @1x (1920x1080), @2x (3840x2160), @3x (5760x3240)
   - Compress to <500KB per image without visible quality loss
   - Use PNG for transparency support or WebP for better compression

3. **Cultural review**:
   - Review each image against checklist above
   - Get feedback from Tibetan community member if possible
   - Regenerate any problematic images

4. **Integration**:
   - Add to React Native Image.resolveAssetSource
   - Update asset manifest
   - Test on both iOS and Android devices
