# Android Performance Audit — EveryBible

**Type:** Diagnostic / research pass (precedes any implementation plan)
**Drafted:** 2026-06-11

## Goal
Diagnose *why* EveryBible feels slow on older / low-end Android phones, and produce a
**ranked, evidence-backed list of fixes**. Lead with **scroll/list jank** and **navigation lag**
(the reported symptoms); keep **cold-start** and **audio/animation jank** in scope as secondary.

## Target hardware ("older Android" = what, exactly)
Low-to-mid Android: ~2–4 GB RAM, Android 9–12, slow eMMC storage, Adreno 5xx / Mali-G52-class GPUs.
A large share of EveryBible's audience (Nepal, India, global-south markets) is on budget hardware —
this is a **primary audience, not an edge case**. Assume Hermes + **old RN architecture** unless the
audit proves otherwise.

## Constraints (do NOT recommend these)
- Expo **managed** workflow — no ejecting; Expo-compatible modules only.
- Old RN architecture is intentional (New Arch **off**; MMKV 2.12.2 and Reanimated 3.19.5 are pinned
  to old-arch-safe versions). Don't propose flipping `newArchEnabled` as a casual fix.
- Theme context, i18n keys, and Zustand-store patterns are house rules — fixes must respect them.

## What to investigate
1. **Lists & virtualization** — scroll jank (FlatList/FlashList/ScrollView/`.map`, keyExtractor,
   estimatedItemSize/getItemLayout, item memoization, the verse list, book/chapter/plans/translation lists).
2. **Re-render hygiene & navigation** — nav lag + general jank (Zustand whole-store subscriptions,
   inline styles/callbacks/objects, missing memo/useMemo/useCallback, ThemeContext fan-out,
   React Navigation `lazy`/`freezeOnBlur`/`detachInactiveScreens`/screens config, provider tree).
3. **Native / startup / Android config** — Hermes on?, new-arch state, ProGuard/R8/minify,
   startup side-effects, MMKV/SQLite hydration timing, bundled `bible-bsb-v2.db` copy-on-first-launch,
   asset/bundle size.
4. **Animations, blur, gradients, images** — overdraw & GPU cost on weak GPUs (expo-blur "liquid glass"
   reader chrome, Reanimated swipe/scroll-collapse, LinearGradient, elevation/shadows, image decode/caching).

## Output — per finding
- Title + `file:line`
- **Severity:** Critical / High / Medium / Low (by user-perceived impact on old Android)
- **Symptom it explains:** scroll · nav · startup · audio/anim
- **Root cause:** the actual mechanism (bridge traffic, re-render storm, main-thread block, overdraw…)
- **Fix direction:** concrete and Expo-safe
- **Effort:** S / M / L
- **How to measure the win:** e.g. FlashList blank-area, JS FPS, cold-start TTI, Android GPU overdraw debug

## Anti-goals
- No generic "use FlashList everywhere" advice without checking what's already migrated.
- No micro-optimizations that won't move the needle on a 3 GB phone.
- Every claim backed by `file:line` evidence.

## Routing note
This is a **diagnosis**, not an implementation plan. Once findings land and you pick which to fix,
the natural GSD path is: `/gsd:add-phase` → "Android Performance Hardening" → `/gsd:plan-phase` with
this audit's findings as CONTEXT.
