# Tibetan Localization - Implementation Checklist

**Status:** In Progress
**Last Updated:** 2026-02-05

---

## ✅ Completed

### Phase 1: Image Generation
- [x] Root cause analysis of batch generation failure
- [x] MCP configuration fixed (removed --batch flag)
- [x] Generated 3 Tibetan-themed images:
  - home-hero.png (1408×768, 1.6 MB)
  - field-gospel.png (1408×768, 1.7 MB)
  - field-discipleship.png (1408×768, 1.5 MB)
- [x] Images saved to `/assets/tibetan/`
- [x] Generation script created at `/scripts/generate-tibetan-images.ts`
- [x] Documentation created (`GENERATION_REPORT.md`)

---

## ⏳ In Progress

### Phase 2: Image Review & Optimization
- [ ] **Visual Review** - Verify images match design vision
- [ ] **Cultural Review** - Review with Tibetan speaker for cultural appropriateness
- [ ] **Generate @2x versions** (2816×1536 for Retina displays)
- [ ] **Generate @3x versions** (4224×2304 for iPhone Pro Max)
- [ ] **Optimize file sizes** (consider using imagemin or similar)

### Phase 3: App Integration
- [ ] **Update asset references** in relevant screens:
  - `src/screens/home/HomeScreen.tsx` (home-hero.png)
  - `src/screens/learn/FieldOverviewScreen.tsx` (field images)
- [ ] **Test on iOS simulator** - Verify images load and display correctly
- [ ] **Test on Android emulator** - Check cross-platform compatibility
- [ ] **Test on physical devices** - Verify performance with real assets

---

## 📋 Pending

### Phase 4: Theme System Update (from plan)
- [ ] Update `ThemeContext.tsx` with Tibetan color palette:
  - Primary: Maroon (#8B1538)
  - Secondary: Saffron Gold (#FFB11B)
  - Tertiary: Sky Blue (#87CEEB)
- [ ] Update `colors.ts` with Tibetan theme colors
- [ ] Test theme switching (light/dark modes)
- [ ] Verify all UI components adapt to new colors

### Phase 5: Content Updates (optional)
- [ ] Research "1 Field 1 Goal" methodology from multipliers.info
- [ ] Update Four Fields course content if needed
- [ ] Update translations for Tibetan cultural context

### Phase 6: Quality Assurance
- [ ] Accessibility review (VoiceOver, TalkBack)
- [ ] Performance testing with new assets
- [ ] Memory usage profiling
- [ ] Network optimization (if serving assets remotely)
- [ ] App store screenshot updates

### Phase 7: Documentation
- [ ] Update project README with Tibetan localization details
- [ ] Document image generation process for future use
- [ ] Update CLAUDE.md with Imagen 4 requirements
- [ ] Create design guidelines document

---

## 🚨 Blockers

None currently.

---

## 📝 Notes

### Image Generation Lessons
1. **Model Version**: Must use Imagen 4 (imagen-4.0-fast-generate-001). Imagen 3 no longer exists.
2. **Batch Limitation**: API doesn't support multiple prompts per request. Use sequential generation.
3. **Content Policy**: Direct people depictions blocked. Use environment-focused prompts.
4. **Resolution**: Imagen 4 produces 1408×768 for 16:9 (not 1920×1080).

### Design Decisions
- **Prompt Strategy**: Environment storytelling vs direct people depictions
- **Color Palette**: Maroon, saffron gold, sky blue (Tibetan cultural colors)
- **Art Style**: Procreate digital painting (warm, approachable, not photorealistic)
- **Cultural Guidelines**: Avoid Buddhist idols, political symbols, religious worship focus

### File Locations
- Generated images: `/assets/tibetan/*.png`
- Generation script: `/scripts/generate-tibetan-images.ts`
- Documentation: `/assets/tibetan/GENERATION_REPORT.md`
- Root cause analysis: `/SCRATCHPAD.md`

---

## 🔗 Related Documents

- [GENERATION_REPORT.md](./assets/tibetan/GENERATION_REPORT.md) - Full technical report
- [SCRATCHPAD.md](./SCRATCHPAD.md) - Root cause analysis
- [Plan transcript](/.claude/plans/lucky-puzzling-waterfall.md) - Original implementation plan

---

**Next Action**: Visual review of generated images, then proceed with @2x/@3x generation.
