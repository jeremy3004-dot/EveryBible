# Site audit after the language pages (2026-09-24)

This audit covers everybible.app after the ~9,800 `/languages/<slug>` pages
landed. It was run against a local `next build` + `next start` of origin/main
(a9f0b9c7), then against the fixes on this branch.

**Summary.** The pages had no layout, landmark, heading, focus or console
problems. Five problems were fixed:

- test entries were published as pages;
- "in the Bookkeeping family" appeared on about 940 pages;
- titles and descriptions were too long for search results;
- the breadcrumb links failed the colour-contrast check;
- 404s for app routes lost the site chrome, and the Google Play badge was
  distorted.

Two larger content problems are left for a data decision (see Open items).

## Method

- **Browser checks.** Headless Chrome (Playwright) with axe-core 4, at 375 and
  1280 px wide. Pages:
  - `/` and `/languages`;
  - English (`english-eng`, 176 dialects);
  - Standard Arabic (`standard-arabic-arb`);
  - a recording-project-only language (`koro-wachi-bqv`, "Translation
    started");
  - no Scripture and no country (`atuence-atf`);
  - a dialect parent (`tase-naga-nst`, 148 dialects);
  - Yoruba;
  - two pseudo-family pages (Borna, Indian Sign Language);
  - `/privacy`, `/support` and `/about`;
  - an unknown slug.
- **What each browser check covered.**
  - horizontal overflow;
  - h1 count and skipped heading levels;
  - landmarks and link names;
  - image alt text;
  - axe contrast and the other WCAG A/AA rules;
  - Tab-order focus styles;
  - `lang`;
  - the console.
- **SEO checks.** Title, description, canonical, robots, hreflang and JSON-LD
  for every page above. For all 9,795 records, we also computed title and
  description lengths offline.
- **Lighthouse.** Lighthouse 12 with the default mobile preset (simulated slow
  4G), best of two runs.
- **Production.** Plain `curl`, one request per URL.

## Findings and fixes

| #   | Finding                                                                                                                                                                                                                                          | Severity                        | Status                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 25 test or retired Every Language tracker records had public, indexable pages and sitemap entries. Examples: "Test 6a", "Test language 簡化字", "TESTY bislama", "Mangala {Delete}", "MISTAKES", "Needs Verification", "Pray 3", "… (retired)".  | High (public junk pages)        | **Fixed.** `hasLanguagePage()` excludes a record only when it comes from the tracker alone, has no ISO, Glottocode or ROLV code, and its name matches the placeholder pattern. It now has 404s, is out of the sitemap, and the map profile has no page link. There are 9,770 pages, down from 9,795. |
| 2   | 944 pages said "X is a language in the Bookkeeping / Unclassifiable / Unattested / Sign Language / Pidgin family". These are Glottolog pseudo-families, not families. The "Language family" row and the map profile repeated the error.          | High (wrong on-page facts)      | **Fixed.** `language-family.ts`: Bookkeeping, Unclassifiable and Unattested now give "is a language". Other pseudo-families give "is a sign language", "a pidgin", "a mixed language", "a constructed language" or "a speech register". The row is hidden for pseudo-families.                       |
| 3   | 3,489 titles were over 60 characters; the longest was 96. The suffix "language: Bible and Scripture status \| EveryBible" alone is 50 characters.                                                                                                | Medium (SEO)                    | **Fixed.** Longer names drop words from the end, never the name. 5 titles are still over 60 because the name alone is more than 42 characters. All titles stay unique; a test checks this.                                                                                                           |
| 4   | 9,223 descriptions were over 160 characters; the longest was 294.                                                                                                                                                                                | Medium (SEO)                    | **Fixed.** The closing invitation is shortened, then dropped. 97 remain over 160 because the facts alone are longer.                                                                                                                                                                                 |
| 5   | Breadcrumb links scored 3.69:1 contrast (`--primary-deep` on the dark surface). Every language page and `/languages` failed axe `color-contrast` (serious).                                                                                      | Medium (WCAG AA)                | **Fixed.** In dark mode the links use `--primary`, like the other static-page links.                                                                                                                                                                                                                 |
| 6   | 404s for app routes (such as an unknown `/languages/<slug>`) used Next's bare default page. It had no header, footer, `<main>` or skip link. After hydration the browser also re-applied the homepage title and `canonical=/`.                   | Medium                          | **Fixed.** Added `app/not-found.tsx` with site chrome, its own title and description, and no canonical. `generateMetadata` now calls `notFound()`, so the client keeps that metadata. The error page adds a "Browse languages" link and `id="main"`.                                                 |
| 7   | The Google Play badge PNG includes its own padding (646×250, ratio 2.58) but was drawn at 142×42 (ratio 3.38), so it was stretched. Lighthouse flagged `image-aspect-ratio`. On the homepage it was drawn much smaller than the App Store badge. | Low (visual, Best Practices 96) | **Fixed.** Trimmed the PNG to the badge (564×168) and drew it at 141×42. It now matches the App Store badge on both pages.                                                                                                                                                                           |

### Checked and clean

- **Layout and navigation.** No horizontal scroll at 375 or 1280 on any page.
  There is one h1 per page and no skipped heading levels. Every page has
  `main`, `header`, `footer` and a labelled breadcrumb `nav`, and the skip link
  works. Tab order shows visible focus.
- **Links and images.** No link is missing a name, and no `<img>` lacks `alt`.
- **Console.** No console errors, apart from the expected 404 status on the
  404 page. The homepage logs only WebGL "READ-usage buffer" performance
  warnings from MapLibre in headless Chrome.
- **`lang` and `dir`.** `<html lang="en">` is set. No language name, alias or
  dialect in the data uses a right-to-left script: a scan for U+0590–U+08FF
  found none. All names are romanised, so no `dir="rtl"` is needed. Only one
  record had non-Latin script, and it was a test entry, now removed.
- **Canonicals.** Every page's canonical URL is absolute and correct.
- **Robots.** No page is accidentally noindexed. `robots.txt` lists
  `/sitemap.xml` and `/languages/sitemap/0.xml`, and both return 200 with the
  right XML.
- **Hreflang.** None is set, which is correct for an English-only site.
- **JSON-LD.** It parses on every page. The homepage uses `Organization`,
  `WebSite` and `MobileApplication`. Language pages use `WebPage`, `Language`
  (with `PropertyValue` identifiers and `sameAs`) and `BreadcrumbList`. All are
  valid schema.org types and properties, and there are no invented ratings.

### Lighthouse (mobile preset, local production build)

| Page                                   | Perf      | A11y     | Best practices | SEO | LCP       | CLS | TBT          |
| -------------------------------------- | --------- | -------- | -------------- | --- | --------- | --- | ------------ |
| `/` before → after                     | 86 → 87   | 100      | 100            | 100 | 3.2 s     | 0   | 260 → 220 ms |
| `/languages/yoruba-yor` before → after | 99 → 97\* | 96 → 100 | 96 → 100       | 100 | 2.1–2.5 s | 0   | 0 ms         |
| `/languages` before → after            | 97        | 96 → 100 | 100            | 100 | 2.6 s     | 0   | 0 ms         |

\*The language-page performance score varies between runs from 97 to 99, with
LCP between 2.0 and 2.5 s. The variation is noise from simulated throttling,
not a change.

**Where the homepage time goes.**

- **LCP.** The LCP element is the headline. LCP is limited by three
  render-blocking stylesheets (about 700 ms) and the self-hosted fonts.
- **JavaScript.** "Unused JS" (169 KB) is MapLibre, which the map needs.
- **Page weight.** The 4.8 MB total is the 1.6 MB atlas snapshot plus the
  basemap tiles.

**Tried and not kept.** Not preloading the JetBrains Mono label font made no
measurable LCP difference, so it was reverted. None of the remaining items
would be a cheap win:

- the render-blocking stylesheets are all needed;
- the 11 KB of Next's built-in polyfills cannot be removed without a
  browserslist change in `package.json`, which is out of scope here;
- the footer wordmark could save 5 KB of compression.

## Production (https://everybible.app, checked 2026-09-24)

Today's main is live: the language pages are deployed.

| URL                              | Status | Notes                                              |
| -------------------------------- | ------ | -------------------------------------------------- |
| `/`                              | 200    | `x-vercel-cache: PRERENDER`                        |
| `/languages/yoruba-yor`          | 200    | Correct title and canonical                        |
| `/languages`                     | 200    | 203 KB HTML                                        |
| `/robots.txt`                    | 200    | Lists both sitemaps                                |
| `/sitemap.xml`                   | 200    |                                                    |
| `/languages/sitemap/0.xml`       | 200    | 1.7 MB, 9,795 URLs                                 |
| `/languages/test-6a-el-5402abf8` | 200    | Placeholder page is live until this branch deploys |
| `/languages/does-not-exist-zzz`  | 404    |                                                    |

## Open items (not changed here)

> **Follow-up (same day).** Items 1 and 2 and the punctuation part of item 3
> are now handled in the page builder; see Macrolanguages, Thin pages and
> Display names in `docs/public-language-atlas.md`. The 59 macrolanguage pages
> with Scripture in a member now show it, 675 thin pages are out of the sitemap
> (267 point their canonical at the coded language of the same name, 408 are
> noindex), and trailing tracker noise is removed from displayed names. Typos,
> non-languages and bracketed notes in the tracker still need a source fix.

1. **About 45 macrolanguage pages say "no known Scripture".** These are ISO
   macrolanguage records such as Arabic (`ara`), Chinese (`zho`), Persian
   (`fas`), Swahili (`swa`), Malay (`msa`), Nepali macrolanguage (`nep`),
   Quechua, Oromo, Mongolian and Kurdish. They have status `unknown`, so they
   show a red "No known Scripture" badge and the sentence "Our sources record
   no known Scripture in Arabic". Scripture is recorded against the member
   languages, such as Standard Arabic. These are high-search names, so the
   pages mislead visitors.
   - **Suggested fix:** in the page builder, give a macrolanguage its own
     status, or a link to its members (for example, a status from the members
     or a "see Standard Arabic" link).
   - **Blocked on data:** the public snapshot has no macrolanguage-to-member
     mapping, so this needs data work first.
2. **675 thin pages.** These are tracker-only records with no ISO or Glottolog
   code and no country, so each page reads only "X is a language. Our sources
   record no known Scripture in X." Some are also duplicates or near-duplicates
   of registry languages: Arabic, Persian, Latvian, Mongolian, Hmong, "English
   Group", "Nepali (Macrolanguage)". At this scale, thin pages risk Google's
   doorway/thin-content treatment.
   - **Options:** noindex those pages, or drop them from the sitemap until they
     are reconciled.
   - **Needs an owner decision:** these options change indexing on purpose, so
     they were not made here.
3. **Tracker names need cleanup at the source.** Examples:
   - trailing punctuation or colons: "Marwari.", "Naxi.", "Bine:", "Farsi:";
   - editorial notes: "Tunen (change to tvu)", "KARE [PNG]";
   - typos: "Western Armeninan", "Skane: Ska;nska";
   - non-languages: "The", "Europanto", "Multilingua Maternal".

   Placeholder records also remain in the homepage map snapshot, which is
   built by `scripts/language-atlas/build_public_atlas.py`. Only the pages and
   profile links exclude them.

4. **Country names lack "the".** The intro and description read "spoken in
   United States" and "spoken in Central African Republic and South Sudan",
   because country names come without articles. A small list of names that
   take "the" would fix this.
5. **The homepage description is 167 characters.** This is shared site copy,
   so it was left for the owner.
6. **Small SEO extras.** `/languages` has no JSON-LD; a `CollectionPage` plus
   `BreadcrumbList` would match the detail pages. `/sitemap.xml` sets
   `lastmod` to the build time on every deploy, so it does not signal real
   changes.
7. **The site's dark theme uses "primary-deep" in other places.** Only the
   breadcrumb failed axe on the pages audited. `.static-page__content a` and
   `.static-page__backlink` already have dark overrides.

## Verification

- **Tests.** New tests were written first and failed before the fixes:
  - `language-family.test.ts`;
  - title, description and pseudo-family cases in `language-page-seo.test.ts`;
  - the placeholder predicate in `language-slug.test.ts`;
  - placeholder exclusion, no committed placeholders, and unique titles of 60
    characters or fewer in `language-pages.test.ts`;
  - pseudo-family profile identity in `public-atlas-profile.test.ts`.
- **Regenerated data.** `npm run atlas:pages:build` regenerated the pages, and
  `npm run atlas:pages:check` is clean.
- **Checks run.** `npm test` (5,298 pass), `npx tsc --noEmit -p apps/site`,
  site ESLint and `next build` all pass.
- **After the fixes.** Axe reports no violations on any audited page at either
  width. Language-page and hub accessibility and best-practices scores are 100.
