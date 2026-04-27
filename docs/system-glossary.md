# EveryBible System Glossary

A comprehensive reference for domain terms, system names, and abbreviations used throughout the EveryBible project. Search here when you encounter unfamiliar terminology in code, documentation, or conversation.

---

## 1. BIBLE & CONTENT TERMS

### BSB (Berean Standard Bible)
The default bundled Bible translation used throughout the app. Contains 31,086 verses. Provides the primary offline reading experience when app launches.

### WEB (World English Bible)
A secondary bundled Bible translation (British edition). Contains 31,098 verses. Available for offline reading alongside BSB.

### ASV (American Standard Version)
A third bundled Bible translation. Contains 31,086 verses. Available for offline reading alongside BSB and WEB.

### Translation
A complete Bible text variant (e.g., BSB, WEB, ASV) with independent text data and optional audio streams. Each translation is independently managed in the app's translation system.

### Translation Catalog
Registry of all available translations with metadata including `has_text`, `has_audio`, and `distribution_state`. Defines which translations are available to users and their current state.

### Translation State Machine
Five-stage lifecycle for downloading and installing translation content:
1. **seeded** — Translation exists in catalog but content not yet downloaded
2. **downloading** — Content pack(s) actively downloading
3. **verifying** — Checksum validation of downloaded content
4. **installing** — Content being written to local storage
5. **installed** — Ready for use

Also supports failure states: **failed** → **rollback-available**

### Text Pack
A bundled translation's text data in SQLite format. Hosted on Cloudflare R2 and downloaded on-demand. Contains all verses for a translation with FTS5 indexes for search.

### Audio Pack
ZIP archive of chapter audio files for a translation. Downloaded separately from text packs. Extracted and indexed locally for playback.

### Audio Provider
Source system for streaming audio content:
- **bible-is** — Bible.is API (requires API key)
- **ebible-webbe** — eBible.org public streaming source

### Audio Strategy
Mechanism for how audio is delivered to the user:
- **provider** — Stream from Bible.is or similar provider
- **stream-template** — Build URLs from chapter/verse data and stream via template
- **audio-pack** — Use locally-downloaded ZIP archive of pre-recorded chapters

### Audio Granularity
Smallest addressable unit for audio playback:
- **chapter** — Entire chapter as single file
- **verse** — Individual verse as separate file

### Chapter Key
Deduplication and progress tracking identifier. Format: `{bookId}_{chapter}` (e.g., `GEN_1`, `JHN_3`). Used in audio deduplication and progress records.

### bookId
3-letter canonical book code following standard Bible indexing (e.g., GEN, EXO, LEV, MAT, JHN, REV). Used throughout the codebase for book identification. See `src/constants/books.ts`.

### Verse of the Day
Daily featured Bible verse displayed on the Home tab. Selected from `POPULAR_VERSE_REFERENCES` array in `src/data/`, indexed by day-of-year (0-364). Changes automatically at midnight in user's local timezone.

### FTS5
SQLite full-text search extension used for efficient Bible search. Implements BM25 relevance ranking to surface most relevant verses when users search for keywords. Indexed on both KJV and BSB text for cross-language search compatibility.

### Cross-Reference
Link between related Bible passages. System supports both a 28-entry sample dataset (currently in production) and a full 500K+ reference dataset from OpenBible.info (planned for future release). Allows users to explore connections between passages.

---

## 2. DISCIPLESHIP & LEARNING TERMS

### Four Fields
Core discipleship framework with five sequential stages:
1. **Entry** (Field 1) — Building relationships and sharing stories
2. **Gospel** (Field 2) — Teaching Bible stories and salvation message
3. **Discipleship** (Field 3) — One-on-one mentoring and spiritual growth
4. **Church** (Field 4) — Community building and leadership development
5. **Multiplication** (Field 5) — Planting new groups and generational impact

Each field has dedicated courses, lessons, and progress tracking. See `src/services/courses/` and `src/stores/fourFieldsStore.ts`.

### Field
One stage in the Five Fields progression. Each field contains multiple courses and represents a distinct phase of spiritual development. Referenced by numeric ID (1-5) throughout the codebase.

### Course
Complete curriculum for a field. Contains all lessons organized within that field. Users progress through courses sequentially within each field. Tracked in Supabase `courses` table.

### Lesson
Individual teaching unit within a course. Contains structured content sections, key verse, practice activity, and discussion questions. Each lesson is typically 15-30 minutes of study material.

### Section
Content block types within a lesson. Possible section types:
- **text** — Paragraph body content
- **scripture** — Bible verse quotation
- **bullets** — Bulleted list of points
- **discussion** — Facilitated discussion prompt
- **activity** — Hands-on application exercise
- **prayer** — Guided prayer reflection

### Takeaway
Key learning point or summary statement that captures the primary teaching of a lesson. Reinforces the main concept for user retention.

### Practice Activity
Hands-on application exercise embedded between lessons. Encourages learners to apply Biblical principles to real-life situations. Completion marked in progress tracking.

### Gather
The app's learning tab (previously labeled "Harvest"). Contains Foundations (sequential Bible studies) and Wisdom Topics (thematic lesson series). Accessible to all users; authenticated users track progress.

### Foundation
Sequential Biblical study series. App includes 7 foundations with approximately 10 lessons each (70 lessons total). Foundations provide structured, progressive Bible teaching appropriate for new believers through mature disciples.

### Wisdom Topic
Thematic lesson series organized into 5 categories:
- Inner Life
- Challenge
- Money
- People
- Knowing God

24 total topics across all categories. Users can study topics in any order.

### DBS (Discovery Bible Study)
Facilitated group discussion format with three sections:
1. **Fellowship** — Icebreaker or relationship-building question
2. **Story** — Bible passage reading and group discovery discussion
3. **Application** — Practical takeaway and commitment to change

Supported as a group session format in the app.

---

## 3. GROUP & COMMUNITY TERMS

### Group
Collection of users studying together. Local representation syncs to Supabase backend. Managed in `src/stores/fourFieldsStore.ts` (group state) and `supabase/migrations/` schema.

### Join Code
6-character alphanumeric code for inviting members to a group. Designed to exclude ambiguous characters (O/0, I/1, l/1) for clarity when shared verbally or by message.

### Group Leader
User who creates and administers a group. Has permissions to create sessions, manage members, and moderate discussions. Typically one leader per group, though schema allows multiple.

### Group Member
Participant in a group. Has permission to view group sessions, participate in discussions, and submit prayer requests. Cannot create sessions or manage group.

### Group Session
Record of a lesson or DBS studied together. Contains:
- Date and time of study
- Field/lesson studied
- Notes from discussion
- Attendance tracking (which members participated)
- Any discussions or decisions recorded

Synced to Supabase `group_sessions` table.

### Prayer Request
User-submitted prayer need scoped to a group. Visible to all group members. Tracked with submission timestamp and user attribution.

### Prayer Interaction
Response to a prayer request. Two types:
- **prayed** — User prayed for the request
- **encouraged** — User left an encouraging message

Each interaction is tracked independently; one user can register multiple interactions per request. Aggregated on prayer wall display.

### Prayer Wall
UI screen displaying group prayer requests with interaction counts. Shows all active prayer requests for a group, sorted by most recent or most-interacted. Central hub for intercession and encouragement in group contexts.

---

## 4. READING PLAN TERMS

### Reading Plan
Curated Bible reading schedule bundled locally in `src/data/readingPlans.generated.ts`. Plans specify which chapters to read on which days. Available offline without authentication.

### Timed Plan
Fixed-duration reading plan with slug-based IDs (e.g., `psalms-30-days`, `bible-in-90-days`). Runs for a fixed number of days; on completion, users can re-start or move to another plan. Completion tracked in Supabase.

### Recurring Plan
Calendar-based reading plan with UUID-based IDs. Resets based on configurable schedule (daily, weekly, monthly). Automatically resets after completion, encouraging ongoing Bible engagement.

### Schedule Mode
Reset pattern for recurring plans:
- **calendar-day-of-month** — Resets on a specific day of each calendar month (e.g., 1st, 15th)
- **calendar-day-of-week** — Resets on a specific day of each week (e.g., Monday, Sunday)

### Plan Entry
Single day's reading assignment within a plan. Specifies book, chapters, and verse ranges to read. Example: "Genesis 1:1-31, Genesis 2:1-25".

### Plan Session
Individual reading sitting within a day. Divided by time-of-day for users who prefer multiple shorter reading sessions. Completion tracked separately per session.

### Session Key
Time slot identifier for plan sessions:
- **morning** — Early-day reading
- **midday** — Mid-day reading
- **evening** — Evening reading

### Rhythm
User-created multi-plan reading sequence combining multiple plans with time-of-day assignments. Allows personalized reading schedules (e.g., "Psalms in morning, OT in midday, NT in evening").

### Completion Entry Key
Format for tracking plan completion in progress storage:
- Timed plan: `plan-id/day-N` (e.g., `psalms-30-days/day-15`)
- Recurring plan with sessions: `plan-id/day-N/session-key` (e.g., `daily-ot/day-1/morning`)

### Staleness Grace Period
5-minute window after marking a chapter read where local progress always wins over remote Supabase data. Prevents remote stale data from overwriting recent local changes during sync conflicts. Controlled by `UNSYNCED_LOCAL_PROGRESS_GRACE_MS` constant.

---

## 5. USER & PREFERENCE TERMS

### Discreet Mode
Privacy feature that transforms the app's appearance to protect user privacy in sensitive contexts:
- Changes app icon to generic name
- Requires 4-6 character PIN to launch
- Activates the calculator-style lock immediately after enabling discreet mode
- App automatically relocks when moved to background
- Prayer requests and group content remain hidden from lock screen

Configured in user preferences, stored in `privacyStore` and secure device storage.

### Privacy PIN
Calculator-style code using digits (0-9) and arithmetic operators (+, -, *, /). The app normalizes display characters (× → *, ÷ → /) internally. Does not accept letters. Used to unlock discreet mode. Stored securely via `expo-secure-store`.

### Font Size
User preference controlling Bible text scale:
- **small** — Compact text, more verses per screen
- **medium** — Default size
- **large** — Expanded text, larger for accessibility

Affects all Bible reading screens. Users can adjust mid-reading without restarting. See `useFontSize()` hook in `src/hooks/`.

### Theme
Visual appearance mode preference:
- **dark** — Dark background with light text (default for evening reading)
- **light** — Light background with dark text
- **low-light** — High-contrast dark mode optimized for poor lighting conditions

Controlled via `ThemeContext` in `src/contexts/`. Affects all UI colors and components.

### Appearance Palette
Accent color scheme for UI elements. Default is **ember** (maroon accent). Additional options include **sapphire** (blue), **teal**, and **olive**. Users can customize brand color while maintaining theme consistency. Defined in `src/constants/colors.ts`.

### Interface Language
Language used for app UI (navigation, buttons, settings, dialogs). Separate from content language. App supports 21 languages including Arabic and Urdu (RTL languages). Detected from device locale or set manually by user. Managed via `i18next` in `src/i18n/`.

### Content Language
Language of Bible text displayed during reading. Can differ from interface language (e.g., UI in English, Bible in Spanish). Tied to available translations. Users can switch content language independently of UI language.

### Engagement Score
Composite metric (0-100) computed nightly via Supabase edge function. Weighted formula:
- 35% — Daily Bible reading activity
- 25% — Audio listening time
- 20% — Consecutive day streak
- 10% — Reading plans completed
- 10% — Community/group participation

Determines featured content and user activity badges. See `aggregate-engagement` edge function in `supabase/functions/`.

### Streak
Consecutive days with reading activity. Tracks unbroken sequences; resets to 0 if a day is skipped. Displayed on Home tab. Motivates daily Bible engagement.

---

## 6. ANNOTATION TERMS

### Annotation
User-created bookmark, highlight, or note on a Bible verse. Local-only; does not sync to cloud. Stored in SQLite on device. Survives app updates. Types include highlights (with color) and notes (text content).

### Highlight Color
Color applied to highlight annotations:
- **yellow** — Default, general emphasis
- **pink** — Important or urgent
- **blue** — Question or unclear passage
- **green** — Application or action item

Users choose color when creating highlight. Multiple highlights can exist on same verse with different colors.

### Composite Key
Deduplication key format for annotations: `${book}|${chapter}|${verse_start}|${type}`. Ensures only one highlight per color per verse (overwrite on re-highlight) while allowing notes. Example: `GEN|1|1|highlight-yellow`.

### Soft Delete
Setting `deleted_at` timestamp instead of removing annotation record entirely. Allows undo functionality and audit trail. Soft-deleted annotations are hidden from UI but retained in database.

---

## 7. SYSTEM & INFRASTRUCTURE TERMS

### Supabase
Backend-as-a-service platform providing PostgreSQL database, authentication, edge functions, and real-time subscriptions. Primary backend for EveryBible user data, authentication, and progress syncing. Configured via environment variables in `.env`.

### RLS (Row Level Security)
PostgreSQL policy enforcement at database level. Users can only access their own data (profiles, progress, group memberships). Enforced via Supabase RLS policies on all tables. Protects user privacy without application-level checks.

### Service Role Key
Elevated Supabase API key that bypasses RLS policies. Used only in server-side contexts (edge functions, backend). Never exposed to client app. Required for admin operations and system-level data access.

### Anon Key
Public Supabase API key that respects RLS policies. Safe to expose in client app. Used for all app-initiated database operations. User authentication determines what data RLS permits access to.

### Edge Function
Supabase-hosted Deno function running on Supabase's edge infrastructure. Key functions for EveryBible:
- **track-analytics-events** — Receive and store analytics events
- **aggregate-engagement** — Compute nightly engagement scores
- **send-group-notification** — Push group session notifications
- **submit-chapter-feedback** — Receive user feedback on chapters
- **track-anonymous-usage-events** — Collect unauthenticated usage metrics

Located in `supabase/functions/`.

### Cloudflare Worker
Edge-deployed JavaScript function running on Cloudflare's global network. Used for analytics collection and geolocation services:
- **analytics-collector** — Lightweight events endpoint
- **geo-worker** — Country code and timezone resolution from request headers

Extremely low-latency, geographically distributed.

### R2
Cloudflare's S3-compatible object storage. Hosts:
- Bible audio files (MP3 streams from eBible.org)
- Text pack downloads (SQLite files for each translation)
- User-uploaded images (group photos, etc.)

Configured with appropriate CORS and access policies.

### EAS (Expo Application Services)
Build and submit service for Expo apps. Handles:
- iOS builds (development, preview, production profiles)
- Android builds (development, preview, production profiles)
- TestFlight submission (via `eas submit --platform ios`)
- Google Play submission (via `eas submit --platform android`)

Configured in `eas.json`.

### EAS Remote
Expo-managed credential store and version tracking. Stores iOS signing certificates, provisioning profiles, and maintains canonical build number counter. Synced into native code during local EAS builds via credential injection.

### MMKV
High-performance key-value storage library for React Native. Faster than AsyncStorage. Used in Zustand stores for persisting non-sensitive app state (preferences, reading history, group data). Not suitable for authentication tokens.

### SecureStore
`expo-secure-store` for encrypted, device-level storage. Used exclusively for sensitive data:
- Authentication session tokens
- Refresh tokens
- Privacy PIN (if discreet mode enabled)

Data encrypted at OS level; cannot be accessed by other apps.

### TrackPlayer
`react-native-track-player` library managing audio playback with system integration:
- Lock screen controls (play, pause, skip, seek)
- Background audio capability
- Bluetooth audio device control
- System notification with playback controls

Used by `useAudioPlayer()` hook.

### Turbo
Monorepo task orchestration tool by Vercel. Manages build and development workflows across repo. Speeds up builds by caching task outputs and parallelizing independent tasks.

---

## 8. RELEASE & BUILD TERMS

### TestFlight
Apple's beta testing platform for iOS apps. Internal testers can install beta builds and provide feedback before App Store release. Requires App Store Connect account and beta group configuration.

### Internal Testers Group
Primary TestFlight beta group for EveryBible. Group ID: `3a75b4d5-cae0-4c9a-8880-890f486f605a`. Builds must be attached to this group to be visible to internal testers. Requires explicit attachment after upload succeeds.

### processingState
App Store Connect build status after upload:
- **PROCESSING** — Apple is validating the build (5-10 minutes typical)
- **VALID** — Build passed validation, ready for beta distribution
- **INVALID** — Build failed validation (code signing, entitlements, etc.)

Must reach VALID before attaching to TestFlight groups.

### Build Number
iOS CFBundleVersion value, distinct from marketing version number. Managed by EAS remote and auto-incremented per build. Must increment sequentially; duplicates are rejected by App Store. Synced to native code by `npm run testflight:build-local`.

### IPA
iOS application archive format. Binary submission format for TestFlight and App Store. Generated by `eas build --platform ios --profile production --local`.

### AAB
Android App Bundle format. Binary submission format for Google Play. Generated by `eas build --platform android --profile production`.

### Dev Build
Development client build generated by `eas build --platform ios --profile development`. Includes native modules for:
- OAuth authentication (Apple Sign-In, Google Sign-In)
- Push notifications
- Secure storage

Unlike Expo Go, dev builds support full feature set. Launched via development server (Metro bundler).

### Preview Build
Internal distribution build with embedded JS bundle. Generated by `eas build --platform ios --profile preview`. Distributed via direct link (not TestFlight). Useful for testing without App Store submission overhead.

### Production Build
Store/TestFlight submission build with embedded JS bundle. Generated by `eas build --platform ios --profile production` or `eas build --platform android --profile production`. Ready for public distribution.

### Release Guard
Pre-release validation script (`scripts/testflight_release_guard.ts`). Executed by `npm run release:prepare`. Checks:
- Build number alignment between EAS remote and App Store Connect
- Credential integrity (local vs. remote signing configuration)
- Version metadata consistency

Prevents inadvertent release mistakes (old build number reuse, stale credentials).

### Precheck
IPA validation script (`scripts/testflight_precheck.sh`). Run before TestFlight submission. Verifies:
- Correct bundle ID embedded in IPA
- JS bundle present and non-empty
- Build number matches expected sequence

Catches issues before upload attempt.

---

## 9. ANALYTICS TERMS

### Analytics Event
Named action or state change tracked in the app. Examples:
- `chapter_read_start` — User opened chapter
- `chapter_read_end` — User finished reading chapter
- `audio_play` — Audio playback started
- `group_session_created` — New group session recorded

Events are timestamped and include metadata (user_id, device info, geo context). Sent to analytics service for aggregation.

### Event Queue
In-memory buffer holding analytics events before transmission. Max capacity 500 events. Auto-flushes when full or after 20 events collected (whichever comes first). Reduces network overhead by batching requests.

### Geo Context
Location metadata extracted from request or device:
- **country_code** — ISO 3166 country code
- **lat/lon** — Latitude and longitude coordinates
- **timezone** — IANA timezone identifier

Used for regional insights and localized analytics.

### Geo Source
Origin of geolocation data (priority order):
1. **cloudflare_request_cf** — Cloudflare request headers (free, always available)
2. **ipapi.co** — Free geolocation API (30K requests/day limit)
3. **ipinfo.io** — Paid geolocation service (fallback for high-volume requests)

System attempts resolution in order; falls back on IP-based lookup if header data unavailable.

### 3-Tier Geo Resolution
Layered geolocation strategy:
1. **Tier 1** — Cloudflare CF headers (cheapest, lowest latency)
2. **Tier 2** — ipapi.co free API (30K/day budget)
3. **Tier 3** — ipinfo.io paid service (unlimited, fallback for production)

Optimizes cost and latency while maintaining coverage.

### Session
User's app usage from launch to background/exit. Identified by unique `session_id` (UUID). All events within a session share the same session_id. Allows correlation of user actions within a single app session.

---

## 10. ADMIN PORTAL TERMS

### super_admin
The only administrator role granting access to admin portal. Users with `admin_role = 'super_admin'` in Supabase `profiles` table can access admin dashboard. All other users see error page.

### Operator Chat
AI-powered admin assistant integrated in admin portal. Uses OpenAI API to answer questions about app state, suggest actions, and interpret logs. Provides natural language interface to system health and content management.

### Audit Log
Record of every admin action in the system. Captured in Supabase `admin_audit_logs` table. Includes:
- Action type (e.g., "translation_published", "user_flagged")
- Admin user ID
- Timestamp
- Changes made (before/after JSON)
- IP address and user agent

Enables accountability and troubleshooting of admin activities.

### Health Monitor
Admin dashboard view checking system health:
- Stale user syncs (no activity in X days)
- Missing content (expected translations not found)
- Configuration drift (mismatched env vars across services)
- Database bloat (large tables needing cleanup)

Alerts admins to potential issues before users are affected.

### Translation Sync Run
Admin-triggered content update operation. Follows state machine:
1. **idle** — No sync in progress
2. **running** — Content being downloaded and validated
3. **succeeded** — Sync completed successfully, content now available
4. **failed** — Sync encountered error, rolled back to previous state

Only one sync can run at a time. Triggered via admin portal "Sync Now" button.

### Content Image
Managed image asset (photos, illustrations, charts used in lessons). Has lifecycle:
- **draft** — Created, not yet visible to users
- **scheduled** — Published on future date
- **live** — Currently visible to users
- **archived** — Removed from view but retained for history

Images stored in R2 with CDN caching.

### Distribution State
Translation visibility and availability:
- **draft** — In development, not visible
- **ready** — Content prepared, awaiting admin approval
- **published** — Live and visible to all users
- **hidden** — Temporarily hidden (maintenance, copyright, etc.)

Admin can change state via portal. Synced to app via translation catalog.

---

## 11. SYNC TERMS

### Sync
Bidirectional data reconciliation between device and Supabase backend. Runs periodically when online. Uploads local changes (progress, annotations) and downloads remote changes (group sessions, courses) using merge strategy to resolve conflicts.

### Pull from Cloud
One-way download of remote data to local stores during first authentication. Restores user's previous reading position, bookmarks, progress, and group memberships. Occurs once per login session.

### Merge Strategy
Algorithm for resolving sync conflicts between local and remote data. Uses last-write-wins with special cases:
- **Onboarding reversion protection** — If remote would reopen completed onboarding, local state preserved
- **Fresh install detection** — If local position is Genesis 1:1 with no chapters read, remote position wins (new user)
- **Staleness grace period** — Recent local changes (< 5 min) always win over remote

Ensures user progress is never lost or reverted.

### Onboarding Reversion Protection
Sync conflict rule: if remote progress would reopen onboarding (e.g., user had completed it), local state is preserved. Prevents remote data from undoing user's onboarding completion.

### Fresh Install Detection
Sync heuristic: if local reading position is Genesis 1:1 with zero chapters read, system assumes fresh install and allows remote position to win. Enables restoring reading position on new device while protecting real local activity.

### Debounce
2-second delay after calling `markChapterRead()` before syncing to Supabase. Implemented via in-memory timer. Batches rapid chapter completions into single sync request, reducing network load and server queries.

---

## 12. KEY FILE LOCATIONS & REFERENCES

### State Management
- `src/stores/authStore.ts` — User auth, session, preferences
- `src/stores/bibleStore.ts` — Reading position, bookmarks
- `src/stores/audioStore.ts` — Audio playback state
- `src/stores/progressStore.ts` — Chapter/course progress
- `src/stores/fourFieldsStore.ts` — Discipleship course progress and group management
- `src/stores/gatherStore.ts` — Gather curriculum state
- `src/stores/annotationStore.ts` — Bookmarks, highlights, notes
- `src/stores/libraryStore.ts` — Translation library state
- `src/stores/readingPlansStore.ts` — Reading plan progress
- `src/stores/privacyStore.ts` — Discreet mode state

### Services & Business Logic
- `src/services/auth/` — Authentication (Apple, Google, email)
- `src/services/bible/bibleDatabase.ts` — SQLite Bible data access
- `src/services/courses/` — Course content and Four Fields logic
- `src/services/groups/` — Group management and syncing
- `src/services/sync/` — Bidirectional sync with Supabase
- `src/services/audio/` — Audio playback and Bible.is integration

### Data & Constants
- `src/constants/books.ts` — Book codes and metadata
- `src/constants/colors.ts` — Theme colors and palettes
- `src/data/readingPlans.generated.ts` — Bundled reading plans
- `src/i18n/locales/` — Translation files (en, es, ne, hi)

### Database
- `supabase/migrations/` — Schema migrations
- `supabase/functions/` — Edge functions (analytics, notifications, etc.)

### Navigation
- `src/navigation/types.ts` — Navigation TypeScript types
- `src/navigation/RootNavigator.tsx` — Navigation structure

### Scripts
- `scripts/testflight_release_guard.ts` — Pre-release validation
- `scripts/testflight_precheck.sh` — IPA validation
- `npm run testflight:build-local` — Local iOS production build
- `npm run testflight:submit-and-verify` — Submit and verify TestFlight

---

## 13. QUICK REFERENCE: ACRONYMS

| Acronym | Full Term | Context |
|---------|-----------|---------|
| BSB | Berean Standard Bible | Default translation |
| WEB | World English Bible | Secondary translation |
| ASV | American Standard Version | Tertiary translation |
| FTS5 | Full-Text Search 5 | SQLite search |
| DBS | Discovery Bible Study | Group format |
| RLS | Row Level Security | Database policy |
| MMKV | Multi-Model Key-Value | Storage engine |
| EAS | Expo Application Services | Build service |
| IPA | iOS App Archive | Build artifact |
| AAB | Android App Bundle | Build artifact |
| TestFlight | Apple Beta Testing | iOS distribution |
| OAuth | Open Authorization | Sign-in protocol |
| JWT | JSON Web Token | Auth token |
| UUID | Universally Unique Identifier | Unique ID |
| PIN | Personal Identification Number | Security code |
| RTL | Right-to-Left | Text direction |
| JSX | JavaScript XML | React syntax |
| TSX | TypeScript XML | TypeScript React |
| Supabase | Backend as a Service | Backend platform |
| R2 | Cloudflare R2 | Object storage |
| CDN | Content Delivery Network | Static distribution |

---

## 14. RELATED DOCUMENTATION

- **CLAUDE.md** — Comprehensive project guide (architecture, patterns, commands)
- **SCRATCHPAD.md** — Current session notes and blockers
- **.env.example** — Required environment variables template
- **eas.json** — Build profile configuration
- **app.json** — Expo app configuration
- **package.json** — Dependencies and npm scripts

---

**Last Updated:** 2026-04-15

This glossary is a living document. Update it when introducing new terminology, renaming concepts, or changing system architecture. Keep definitions concise and cross-reference related terms for clarity.
