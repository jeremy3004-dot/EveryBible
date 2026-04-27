# Claude Token Spenddown GSD Phases

## Goal

Use expiring Claude tokens on the highest-leverage work for EveryBible before they expire.

The rule for this plan is simple:

- spend Claude on long-context synthesis, audits, documentation, copy generation, and research
- do not spend Claude on tiny code edits, one-off fixes, or repetitive terminal work

## Decision

The most critical use of expiring Claude tokens is work that reduces shipping risk, clarifies the product, and compounds future execution speed.

That means the order should be:

1. release safety and bug understanding
2. product and UX clarity
3. store growth and conversion
4. durable docs and architecture memory
5. localization and content scale
6. competitive and strategic research

## Recommended execution order

- If time is extremely short, complete Phases 1 through 3.
- If time is moderate, complete Phases 1 through 5.
- If time is generous, complete all phases in order.

---

## Phase 1: Release Safety, QA, And Failure Triage

**Goal**: Burn Claude tokens on the work that most directly prevents shipping mistakes, hidden regressions, and repeated debugging loops.

**Why this is first**:

- EveryBible already ships on iOS and Android.
- The highest-value token spend is preventing bad releases, not polishing already-safe flows.
- Claude is especially useful for clustering failure patterns and turning noisy reports into clear action.

**Best Claude jobs**:

- Read recent TestFlight feedback, bug notes, support messages, and local debug docs, then cluster them by root-cause theme.
- Produce a ranked “top regressions and risks” memo with severity, likely owner, and recommended next fix.
- Audit release checklists, TestFlight submission flow, Play Store flow, and live website/app handoff risks.
- Review recent changes and write a “what could still break production” brief.

**Expected outputs**:

- `top-release-risks.md`
- `bug-clusters.md`
- `release-readiness-checklist.md`
- candidate Linear/GitHub issues with clean repros and severity labels

**Success criteria**:

- Top recurring failures are grouped and named clearly.
- Release blockers are separated from noise.
- The team has one current release-risk checklist instead of scattered notes.

---

## Phase 2: Product UX Audit Across App And Website

**Goal**: Use Claude’s long-context reasoning to find friction across the full EveryBible journey, not just one screen at a time.

**Why this is second**:

- The product already has enough surface area that local tweaks can miss systemic friction.
- Claude is strong at reviewing screenshots, flows, and product language together.

**Best Claude jobs**:

- Audit the full user journey: website -> store page -> install -> onboarding -> reading -> audio -> plans -> support.
- Produce a “top 10 user-friction points” memo ranked by impact on trust, comprehension, retention, and completion.
- Review screenshots of the app and website and point out hierarchy, clarity, accessibility, and conversion weaknesses.
- Compare first-time-user flow against a simpler, more ministry-first experience.

**Expected outputs**:

- `ux-audit-ranked-findings.md`
- `website-to-app-funnel-review.md`
- `onboarding-friction-review.md`
- screenshot-by-screenshot improvement notes

**Success criteria**:

- The highest-friction flows are named and prioritized.
- Fixes are framed as concrete product changes, not vague design opinions.
- The audit gives a clear next set of build tasks.

---

## Phase 3: App Store And Play Store Conversion Optimization

**Goal**: Use Claude to improve conversion from store impressions to installs with stronger positioning, metadata, and screenshot copy.

**Why this is third**:

- This directly affects growth and is a strong use of language-model tokens.
- Good ASO work compounds over time and is annoying to do manually.

**Best Claude jobs**:

- Rewrite App Store and Play Store descriptions for clarity, trust, and ministry positioning.
- Generate subtitle, short description, keyword, and release-note variants.
- Create screenshot headline and subheadline options for iOS and Android.
- Write multiple positioning angles:
  - free and no ads
  - multilingual Bible access
  - read and listen anywhere
  - discipleship and reading plans
- Review competitor listings and identify missing positioning advantages.

**Expected outputs**:

- `aso-core-copy.md`
- `app-store-metadata-variants.md`
- `play-store-copy-variants.md`
- `screenshot-caption-sets.md`

**Success criteria**:

- There is one approved default metadata set for each store.
- There are multiple strong fallback variants ready for iteration.
- Screenshot copy emphasizes what makes EveryBible distinct.

---

## Phase 4: Codebase Documentation And Architecture Memory

**Goal**: Convert Claude tokens into durable project understanding that saves future engineering time.

**Why this is fourth**:

- EveryBible already has a meaningful codebase and release process.
- Good documentation turns expiring tokens into long-term execution speed.

**Best Claude jobs**:

- Read the repo and write a practical architecture map for auth, Bible data, audio, plans, sync, and release flows.
- Produce onboarding docs for a new engineer joining the project.
- Write runbooks for common tasks:
  - shipping to TestFlight
  - diagnosing missing builds
  - Bible data updates
  - website deploys
  - multi-translation behavior
- Generate a glossary of important domain concepts and system boundaries.

**Expected outputs**:

- `architecture-overview.md`
- `new-engineer-onboarding.md`
- `release-runbook.md`
- `system-glossary.md`

**Success criteria**:

- A new contributor can understand the main systems quickly.
- Release knowledge is documented instead of living in chat memory.
- Repeated explanation work drops meaningfully.

---

## Phase 5: Localization And Copy QA

**Goal**: Use Claude to improve language quality, consistency, and translation readiness across EveryBible.

**Why this is fifth**:

- EveryBible’s mission depends on clarity across languages.
- This is a high-leverage language task that models handle well.

**Best Claude jobs**:

- Audit all user-facing copy for theological tone, clarity, and simplicity.
- Find English-centric UI wording that may localize poorly.
- Review translation keys and surface places where tone is inconsistent across screens.
- Generate improved source-language copy designed to localize more cleanly.
- Review support and onboarding copy for readability by non-native English readers.

**Expected outputs**:

- `copy-qa-audit.md`
- `localization-risk-list.md`
- `source-copy-rewrite-pack.md`
- terminology guidance for translators

**Success criteria**:

- Hard-to-localize strings are identified.
- The core source copy becomes simpler and more consistent.
- Translators get clearer wording and terminology guidance.

---

## Phase 6: Support, FAQ, And Community Response Assets

**Goal**: Use Claude to prepare reusable support and ministry communication assets that reduce future response time.

**Why this matters**:

- This turns one-time token spend into repeated support leverage.
- It also improves consistency when users ask the same questions repeatedly.

**Best Claude jobs**:

- Turn support history into a top-questions FAQ.
- Draft help-center style answers for install, audio, downloads, plans, translations, and offline issues.
- Write donor/supporter explanations of what EveryBible does and why it matters.
- Produce website support copy, in-app help copy, and canned response templates.

**Expected outputs**:

- `faq.md`
- `support-response-pack.md`
- `donor-explainer.md`
- `help-center-outline.md`

**Success criteria**:

- Repeated support questions have ready-to-use answers.
- Tone is consistent across support and ministry communication.
- Future support work becomes lighter and faster.

---

## Phase 7: Competitive And Strategic Research

**Goal**: Use Claude for broad synthesis across Bible apps, devotional products, and adjacent faith or habit products.

**Why this is later**:

- High value, but less urgent than release safety, product clarity, and conversion.
- Best done once the immediate product and ops picture is documented.

**Best Claude jobs**:

- Compare EveryBible against Dwell, Bible.is, YouVersion, and other scripture products.
- Identify feature gaps, positioning gaps, and opportunities to be more distinct.
- Analyze what premium-feeling Bible products do well in onboarding, audio, typography, and habit loops.
- Produce a “copy what works, skip what does not fit” memo.

**Expected outputs**:

- `competitive-landscape.md`
- `differentiation-opportunities.md`
- `feature-gap-analysis.md`
- `positioning-recommendations.md`

**Success criteria**:

- The team has a clearer view of where EveryBible should converge versus differentiate.
- Product decisions are informed by the market, not just intuition.

---

## Phase 8: Roadmap And Product Strategy Memos

**Goal**: Use Claude to turn all prior outputs into crisp next-step strategy.

**Why this is last**:

- This phase benefits from everything above.
- It should synthesize, not guess.

**Best Claude jobs**:

- Build a 30-day execution memo from the risk, UX, and ASO findings.
- Build a 90-day roadmap with “must ship”, “should ship”, and “later” buckets.
- Create a versioned feature-priority stack for mobile app, website, and content/distribution.
- Draft a founder-style product memo: what EveryBible should become over the next year.

**Expected outputs**:

- `30-day-action-plan.md`
- `90-day-roadmap.md`
- `priority-stack.md`
- `product-direction-memo.md`

**Success criteria**:

- The next roadmap is derived from evidence, not scattered ideas.
- Execution priorities are clear and defensible.
- The team can decide what not to do as well as what to do.

---

## Fastest high-value token burn if time is short

If the tokens expire very soon, do these first:

1. Phase 1: release safety, QA, and failure triage
2. Phase 2: full UX audit across app and website
3. Phase 3: App Store and Play Store conversion optimization

If there is enough time for two more:

4. Phase 4: codebase documentation and architecture memory
5. Phase 5: localization and copy QA

## Work to avoid spending Claude tokens on

- one-file bug fixes
- simple refactors
- terminal command execution
- repetitive search-and-replace edits
- tiny UI polish changes
- work that already has a deterministic script

## Recommended first Claude prompt

If starting today, begin with Phase 1 using a prompt like:

> Read our recent bug notes, release docs, TestFlight visibility notes, and support/debug files. Cluster the issues by root cause, rank them by release risk, separate noise from blockers, and produce one concise release-risk memo with recommended actions.

## Recommended second Claude prompt

Then move to Phase 2 with:

> Audit the full EveryBible journey from website to install to onboarding to reading, audio, plans, and support. Rank the top user-friction points by severity and expected impact on trust, comprehension, retention, and completion. Recommend specific fixes, not generic advice.

## Outcome

If executed in order, these phases turn expiring Claude tokens into:

- lower release risk
- clearer product priorities
- better store conversion
- stronger documentation
- cleaner localization inputs
- better long-range product judgment
