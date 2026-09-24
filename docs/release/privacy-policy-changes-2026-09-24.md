# Privacy policy and account deletion page: changes for approval (2026-09-24)

Nothing here is live. The branch is committed but not pushed. Please read it, change anything
you disagree with, and then merge. The website picks it up on the next deploy from `main`.

## What changed, in one paragraph

There were two privacy policies that disagreed: the website one (April 2026) and an older
`legal/privacy.html` (January 2025, different email address). Neither mentioned crash reports,
location from IP addresses, voice recordings, push tokens or in-app account deletion. There is now
one text, written in plain English, in `apps/site/lib/legal/privacy-policy.ts`. The website page
`/privacy` shows it, and `legal/privacy.html` is generated from it, marked as a copy, and pointing
at the website version. A test fails if the copy falls out of date. The same applies to the new
`/delete-account` page and `legal/delete-account.html`.

## Privacy policy: wording changes

| Topic                                 | Before                                                                                                          | Now                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                                  | April 3, 2026 (site), January 25, 2025 (legal/)                                                                 | September 24, 2026. **Change it to the day you publish.**                                                                                                                                                                                                                                                                         |
| Contact email                         | hello@everybible.app (site), curryj@protonmail.com (legal/)                                                     | hello@everybible.app everywhere                                                                                                                                                                                                                                                                                                   |
| Summary                               | none                                                                                                            | New "short version" list at the top                                                                                                                                                                                                                                                                                               |
| Usage statistics                      | "product analytics and basic operational diagnostics... where possible we keep this separate from your account" | Lists what is recorded (sessions, chapters opened, reading time, listening, finished chapters, downloads, library actions, app version, platform, random session number). It now says plainly that records **are linked to your account when you are signed in**.                                                                 |
| Approximate location                  | not mentioned                                                                                                   | New section. It covers location worked out from the IP address (country, region, city, time zone, coordinates rounded to about 10 km), says we do not use GPS and do not store the IP with the records, and names the Cloudflare location service plus the ipinfo.io / ipapi.co fallback.                                         |
| Crash reports                         | not mentioned                                                                                                   | New section. It lists what a report contains, says it is not linked to the account and has no IP, and says reports are deleted after 90 days.                                                                                                                                                                                     |
| Account data                          | "name, email, profile photo"                                                                                    | Adds email/password sign-in and the optional profile photo, and lists exactly what syncs (progress, streak, plans, translations, settings, feedback name and role).                                                                                                                                                               |
| Notes, highlights, bookmarks          | Said to be stored/synced with your account                                                                      | **Corrected:** they stay on the device and are not uploaded. The app has no code that uploads them.                                                                                                                                                                                                                               |
| Chapter feedback and voice recordings | not mentioned                                                                                                   | New section. It lists what is stored (including the name and role people must enter, recordings of up to 60 seconds, and a hashed IP for spam control) and **who sees it**: the EveryBible team, translation teams and the Scripture council, including name and recording. It also says feedback can be sent without an account. |
| Push tokens                           | not mentioned                                                                                                   | New section. The token is stored when you are signed in and allow notifications, delivered via Expo, Apple or Google, switched off at sign-out and deleted with the account.                                                                                                                                                      |
| Groups and prayer wall                | not mentioned                                                                                                   | One line: local groups stay on the device, and shared groups and the prayer wall "are not available yet; we will update this policy before they are".                                                                                                                                                                             |
| Service providers                     | Supabase, Apple, Google, "infrastructure providers"                                                             | Names Supabase, Cloudflare, ipinfo.io, ipapi.co, Apple, Google, Expo and Vercel, and says public Bible sources (e.g. eBible.org) see the IP when you download from them.                                                                                                                                                          |
| Retention                             | "as long as needed"                                                                                             | Crash reports 90 days. Usage and location 13 months, then monthly totals only. Account data until deletion. Feedback kept for translation work.                                                                                                                                                                                   |
| Deletion                              | "email us"                                                                                                      | In-app path (More → Settings → Data → Delete Account), a list of what is deleted and what is kept anonymised, and a link to `/delete-account`.                                                                                                                                                                                    |
| Your choices                          | Old list, including "opt out of non-essential collection" (legal/ version)                                      | Realistic list. **It says there is currently no setting to turn off usage statistics or crash reports**, because there isn't one. The old "opt out" and "export your data" promises are replaced by "ask us for a copy".                                                                                                          |
| Children, changes                     | unchanged in substance                                                                                          | unchanged                                                                                                                                                                                                                                                                                                                         |

## Account deletion page

- **New public page `/delete-account`** (Google Play needs a web URL). It is linked from the site
  footer ("Delete your account") and from the privacy policy, and it is in the sitemap.
- **`legal/delete-account.html:110` fixed.** It used to say "We do not retain any personal data
  after account deletion". It now says what is kept without the person's name: anonymised usage
  statistics (until the 13-month purge) and the feedback rating, comment, role and chapter. Name,
  recording and hashed IP are removed from the feedback.
- The in-app steps now match the app: More tab → Settings → Data → Delete Account → Delete.
- The email route now uses hello@everybible.app (was curryj@protonmail.com).
- **"We aim to complete requests within 7 business days and will email you when your account has
  been deleted"** is carried over from the old page. It is a promise about your own process, not
  something code does. Keep it only if you can honour it.

## Statements I could not fully verify from code

1. **"The website does not use analytics or advertising scripts."** This is based on the site's
   security headers (scripts from our own domain only) and on the absence of any analytics code.
   Vercel's own request logs still exist.
2. **Vercel hosts the website, Expo delivers pushes.** Taken from the deployment setup and the
   push code, not from a signed contract list. Add any provider I missed (for example an email
   provider for sign-up emails).
3. **"Recordings... links that expire after a short time"**: the links last 10 minutes (60 for the
   older review screen). The wording is deliberately vague.
4. **Feedback retention "as long as it is useful for translation work"**: there is no purge job.
   This describes the current practice of keeping feedback indefinitely. Consider setting a period.
5. **Live database state** was checked read-only on 2026-09-24: the 90-day crash-report purge, the
   13-month analytics purge and the deletion trigger that clears names and recordings from feedback
   are all installed live.

## Things the policy now exposes that you may want to change instead

- **The in-app delete warning says it deletes "all associated data"**
  (`settings.deleteAccountWarning`, and "Your account and all data have been deleted"). Since
  anonymised statistics and feedback text are kept, that app text should change, in all 21
  languages. That work is outside this branch.
- **No opt-out** for usage statistics or crash reports. It is legal without tracking, but it is
  the first thing a reviewer or user will ask about.
- **Sign in with Apple tokens are not revoked** on deletion, which Apple requires. The page does not
  claim they are.
- **Feedback `participant_role`** (free text such as "pastor") is kept after deletion. The policy
  says so. Clear it in the deletion trigger if you would rather not keep it.

## After you approve

1. Change the date in `apps/site/lib/legal/privacy-policy.ts` (`PRIVACY_POLICY_LAST_UPDATED`) to the
   publish date, then run `npm run legal:mirrors -w @everybible/site`.
2. Merge to `main`. The website deploys from `main`.
3. **The GitHub Pages copy does not update by itself.** `jeremy3004-dot.github.io/EveryBible/` is
   served from the `gh-pages` branch, which still has the old `privacy.html` and
   `delete-account.html`. Copy the two regenerated files there, or retire those pages.
4. In Play Console, change the account deletion URL to **https://everybible.app/delete-account**
   (`store-assets/google-play-listing.md` still lists the github.io address). Update the Data safety
   form and the App Store privacy label so they match the policy
   (`docs/research` store compliance preflight, branch `hardening/compliance`).
