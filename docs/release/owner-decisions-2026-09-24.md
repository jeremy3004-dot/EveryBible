# Decisions and actions waiting on you (2026-09-24)

About 60 pieces of work landed today across the app, the website, the admin site and the
database. Many of them ended with "the owner needs to decide" or "the owner needs to do
this". This page puts them all in one place, with duplicates merged.

Each item has:

- **Question:** what needs deciding or doing, in one sentence.
- **My recommendation:** what I would do.
- **Why it matters:** what happens if nobody acts.
- **How urgent:** before the next release, before Groups launches, or whenever.

Items marked **Action** only need you to do something. Items marked **Decision** need a
choice first.

## At a glance

| #   | Item                                                         | Type     | How urgent                      |
| --- | ------------------------------------------------------------ | -------- | ------------------------------- |
| 1   | Version and build number plan                                | Decision | Before next release             |
| 2   | Refresh the installed packages on the main computer copy     | Action   | Before next release             |
| 3   | Google Play form for background audio                        | Action   | Before next release             |
| 4   | Password-reset link settings in Supabase                     | Action   | Before next release             |
| 5   | Leaked-password protection in Supabase                       | Action   | Before next release             |
| 6   | Two-step sign-in (MFA) in Supabase                           | Action   | Before next release             |
| 7   | Apple sign-in clean-up when an account is deleted            | Action   | Before next release             |
| 8   | What happens to usage data on deletion, and the warning text | Decision | Before next release             |
| 9   | Google Play "delete your account" web page                   | Action   | Before next release             |
| 10  | Portuguese: Brazilian on the feedback screen                 | Decision | Before next release             |
| 11  | NIV wording check (done)                                     | For info | None                            |
| 12  | Give the BSB team its own passcode                           | Action   | Before retiring the shared code |
| 13  | Move translator codes from 6 to 12 digits                    | Decision | A few weeks after release       |
| 14  | Deleted contributors' feedback: also clear their role?       | Decision | Whenever                        |
| 15  | Terms of use: rules for posts, and "I agree" before posting  | Decision | Before Groups launches          |
| 16  | Who gets told about prayer reports                           | Decision | Before Groups launches          |
| 17  | Native speakers check the blocked-words lists                | Action   | Before Groups launches          |
| 18  | A screen to unblock people                                   | Decision | Before Groups launches          |
| 19  | Smaller Groups and Prayer Wall choices                       | Decision | Before Groups launches          |
| 20  | Android push notifications (Firebase)                        | Action   | Before Groups launches          |
| 21  | Supabase support ticket                                      | Action   | Whenever (soon)                 |
| 22  | Language list data from SIL in a public repository           | Decision | Whenever (soon)                 |
| 23  | Size and type limits on the Bible audio storage              | Decision | Whenever                        |
| 24  | Delete the old backup tables                                 | Decision | Whenever (after release)        |
| 25  | Privacy lock: what to do if it fails                         | Decision | Whenever (next release if easy) |
| 26  | "Allow notifications" nudge for synced reminders             | Decision | Whenever                        |
| 27  | Admin site checks after today's fix                          | Action   | Whenever (this week)            |
| 28  | Website: tell Google and Bing about the new pages            | Action   | Whenever                        |
| 29  | Keep admins' emails in the admin history                     | Decision | Whenever                        |
| 30  | Reporting crashes outside the app's own code                 | Decision | Whenever                        |
| 31  | The 20 translated "What's New" texts                         | Action   | Before localized store listings |

---

## Before the next release

### 1. Version and build number plan (Decision)

- **Question:** Should the next release be version 1.0.9 on both stores?
- **My recommendation:** Yes. Call it 1.0.9. The App Store has never had a 1.0.9 version;
  builds with that number only went to TestFlight testers. The next iPhone build number should
  be 448 and the next Android one 492, but check both counters again right before building.
  Build once per platform, from the main branch, after the phone tests pass.
- **Why it matters:** Apple and Google refuse a build that reuses a number. Also, an Android
  production build is made automatically every time the main branch changes (it is not sent to
  Google unless someone asks), so the Android counter may have moved on since today.
- **How urgent:** Before the next release.

### 2. Refresh the installed packages on the main computer copy (Action)

- **Question:** Will you (or an agent) reinstall the project's packages cleanly in the main
  copy of the project on this computer before any build made on this computer?
- **My recommendation:** Yes. Run a clean install and check that the new Android audio package
  and its fix were applied. Builds made in GitHub already do this.
- **Why it matters:** The new lock-screen audio package is missing from the main copy on this
  computer. A build made from it would quietly leave out Android lock-screen audio.
- **How urgent:** Before the next release.

### 3. Google Play form for background audio (Action)

- **Question:** Will you fill in Google Play's "foreground service" form for the new background
  audio?
- **My recommendation:** Yes. In Play Console, go to App content, then Foreground service
  permissions. Choose "media playback", paste the prepared description, and record a short
  video of Bible audio playing with the screen locked and the lock-screen controls in use. A
  draft of the wording is in the release folder.
- **Why it matters:** Google blocks the Android release at review until this form is done.
- **How urgent:** Before the next Android release.

### 4. Password-reset link settings in Supabase (Action)

- **Question:** Will you check two settings in the Supabase dashboard for the new, safer
  password-reset links?
- **My recommendation:** In Authentication, then URL Configuration, make sure
  `com.everybible.app://reset-password` is in the list of allowed redirect addresses. In
  Authentication, then Email Templates, open "Reset password" and make sure the link uses
  the standard `{{ .ConfirmationURL }}` placeholder, not a hand-built link. Then send yourself
  a reset email from a test build and try it (it is on the phone test list).
- **Why it matters:** The new app changed how reset links work. If either setting is wrong,
  nobody using the new version can reset their password.
- **How urgent:** Before the next release.

### 5. Leaked-password protection in Supabase (Action)

- **Question:** Will you turn on Supabase's check that refuses passwords already known from
  data leaks?
- **My recommendation:** Yes. It is a switch in Authentication settings (Password security).
- **Why it matters:** People reuse leaked passwords, which makes their accounts easy to take
  over. Supabase's own security report flags this as off.
- **How urgent:** Before the next release. It takes a minute and does not need an app update.

### 6. Two-step sign-in (MFA) in Supabase (Action)

- **Question:** Will you turn on authenticator-app codes (TOTP) and use them on your own admin
  account?
- **My recommendation:** Yes. Turn on TOTP in Authentication settings and set it up for the
  admin account. App users don't need to use it.
- **Why it matters:** The admin account can see everyone's data. A stolen password alone
  should not be enough to get in. Supabase's security report flags this too.
- **How urgent:** Before the next release.

### 7. Apple sign-in clean-up when an account is deleted (Action)

- **Question:** Will you provide the "Sign in with Apple" key from the Apple Developer account
  so the app can tell Apple when someone deletes their account?
- **My recommendation:** Yes. Create (or find) the Sign in with Apple private key and its
  Key ID in the Apple Developer account, and store it as a server secret. Then an agent can
  build the small server step that tells Apple to forget the account.
- **Why it matters:** Apple requires apps that offer Sign in with Apple to do this when an
  account is deleted. The app does not do it today. It is the biggest open App Store rule gap
  found today, and App Review can reject an update for it.
- **How urgent:** Before the next App Store submission if possible.

### 8. What happens to usage data on deletion, and the warning text (Decision)

- **Question:** When someone deletes their account, should their anonymous usage records be
  kept (today's behaviour) or deleted, and should the warning text change to match?
- **My recommendation:** Keep the totals, but also remove the session code and rough
  location from those records when the account is deleted. Change the in-app warning, which
  now says deletion removes "all associated data", to say personal data is deleted and
  anonymous usage totals are kept. Say the same in the privacy policy. While updating the
  privacy policy, also mention that notes and highlights are included in the phone's own
  backups.
- **Why it matters:** Today the warning promises more than the app does. Both stores allow
  keeping anonymous data, but the words must match what really happens. A record with a
  session code and a location could, in a small town, point back to one person.
- **How urgent:** Before the next release. The new warning text must be translated into 20
  languages, so decide early.

### 9. Google Play "delete your account" web page (Action)

- **Question:** Will you approve a simple "Delete your account" page on the website and link it
  in Google Play's Data safety form?
- **My recommendation:** Yes. An agent can write the page: how to delete from inside the app,
  how to ask by email without the app, and what is kept (anonymous totals, feedback text
  without a name). You then paste its address into the Data safety form in Play Console.
- **Why it matters:** Google requires a way to ask for deletion without the app. Today the
  privacy page only says "email us", which may not be enough.
- **How urgent:** Before the next Android release.

### 10. Portuguese: Brazilian on the feedback screen (Decision)

- **Question:** Are you happy that the chapter feedback screen now uses Brazilian Portuguese,
  like the rest of the app?
- **My recommendation:** Yes, keep Brazilian. Some of its text had been written in European
  Portuguese and was changed today to match the rest of the app and the Brazilian store
  listing.
- **Why it matters:** If your Portuguese-speaking translators are in Portugal or Africa, they
  may prefer European wording. Mixing both on one screen looked careless.
- **How urgent:** Before the next release (the text is inside the app).

### 11. NIV wording check (For information, done)

- **Question:** None. This is to let you know the check is finished.
- **What happened:** 19 of the 29 Four Fields key verses were quoted from the NIV, which needs
  a copyright notice. They now quote the Berean Standard Bible, and an automatic test stops NIV
  wording coming back. Those verses only appear on the group screens, which nobody can reach
  yet, so no user saw them.
- **How urgent:** Nothing to do.

---

## Translator feedback

### 12. Give the BSB team its own passcode (Action)

- **Question:** Will you create a team passcode for the BSB translation team before switching
  off the old shared passcode?
- **My recommendation:** Yes. In the admin site, open Translator access, create a team code for
  BSB and send it to the BSB team. Watch the shared-passcode usage log. When it has shown no
  use for about two weeks, switch the shared code off there.
- **Why it matters:** BSB is the only translation with feedback today, and its team still uses
  the shared code. Switching the shared code off first would lock them out. The shared code
  also gives whoever holds it every team's feedback, including names and recordings.
- **How urgent:** Before retiring the shared code. You can do it now.

### 13. Move translator codes from 6 to 12 digits (Decision)

- **Question:** When should new team codes be 12 digits long instead of 6?
- **My recommendation:** Keep 6 digits as the default until most translators have the new app
  version, then issue 12-digit codes and cancel the 6-digit ones. The admin site already
  offers 10 and 12.
- **Why it matters:** A 6-digit code can be guessed by someone who tries from many internet
  addresses. A 12-digit code cannot. But the current store version only lets people type 6
  digits, so longer codes would lock out anyone who hasn't updated.
- **How urgent:** A few weeks after the next release.

### 14. Deleted contributors' feedback: also clear their role? (Decision)

- **Question:** When a contributor deletes their account, should their role (for example
  "pastor") be removed from their feedback too?
- **My recommendation:** Yes, remove it. Keep the comment and verdict for the translation team,
  as now. Name, ID number and recording are already removed.
- **Why it matters:** In a small church, a role plus a comment can still identify someone.
- **How urgent:** Whenever.

---

## Before Groups and the Prayer Wall launch

Groups and the Prayer Wall are built but switched off, and nobody can reach them. Apple
requires the four things below for any app where people post to each other.

### 15. Terms of use: rules for posts, and "I agree" before posting (Decision)

- **Question:** Will you add a section to the terms of use about what people may post, and
  have members agree before their first post?
- **My recommendation:** Yes. The section should say there is zero tolerance for offensive
  content or abusive people, list what is not allowed, say that reported posts are reviewed
  and removed and offenders banned within 24 hours, and give a contact address. Use a
  dedicated support address instead of the personal one the terms list today. An agent can
  then add the one-time "I agree" step (it needs translating into 20 languages).
- **Why it matters:** Apple rejects apps with user posts that lack these.
- **How urgent:** Before Groups launches.

### 16. Who gets told about prayer reports (Decision)

- **Question:** Who should be told when someone reports a prayer request, and how?
- **My recommendation:** A daily email to the dedicated support address, listing new reports,
  with one named person responsible for checking it.
- **Why it matters:** The 24-hour promise in the terms only works if someone sees reports.
  Today nothing tells anyone; reports only show on the admin site's Prayer Reports page.
- **How urgent:** Before Groups launches.

### 17. Native speakers check the blocked-words lists (Action)

- **Question:** Will you ask native speakers to check the starter list of blocked words?
- **My recommendation:** Yes, especially Arabic, Hindi, Korean and Chinese. Also ask for
  starter words in Bengali, Marathi, Punjabi, Telugu, Tamil, Urdu, Nepali and Japanese, which
  have none yet.
- **Why it matters:** A wrong word blocks someone's genuine prayer. A missing language lets
  abuse through.
- **How urgent:** Before Groups launches.

### 18. A screen to unblock people (Decision)

- **Question:** Should members get a screen that lists the people they blocked, so they can
  unblock them?
- **My recommendation:** Yes, a simple list. Because posts show as "Group member", the list
  needs some way to tell people apart, such as the group and a short quote from their last
  post.
- **Why it matters:** Today a block cannot be undone from the app.
- **How urgent:** Before Groups launches.

### 19. Smaller Groups and Prayer Wall choices (Decision)

These are smaller product choices found today. My recommendation is in brackets.

- Android members can't edit a prayer request, and nobody can un-mark "answered" (add an edit
  screen that works on Android, and allow un-marking).
- A removed member can rejoin with the same join code (make a new code whenever a leader
  removes someone).
- New members can read all past session notes (tell members that notes are visible to current
  and future members, or show notes only to leaders).
- A group stops at the last lesson of a course instead of moving to the next one, and two
  people can record the same meeting twice (move to the next course; allow one record per
  meeting).
- The Four Fields course text is in English only (translate it before launch).
- Group photos and study files are not removed when a group is deleted (fine for now, no files
  exist; handle it when photos are switched on).
- **How urgent:** Before Groups launches.

### 20. Android push notifications (Firebase) (Action)

- **Question:** Will you set up a Firebase project so Android phones can receive group
  notifications?
- **My recommendation:** Yes, but only when Groups is close to launch. It needs a Firebase
  project, its Android settings file, and a Google messaging key stored with Expo.
- **Why it matters:** Without it, Android members never get group notifications. Daily
  reminders are not affected; they work without Firebase.
- **How urgent:** Before Groups launches (deferred until then).

---

## Whenever

### 21. Supabase support ticket (Action)

- **Question:** Will you open one support ticket with Supabase?
- **My recommendation:** Yes, and ask for three things in it:
  1. Remove public access to the database's built-in web-request tool (`pg_net`). Our own
     change could not do it, because Supabase owns that tool.
  2. Move that tool out of the main public area of the database, which their security report
     also flags.
  3. The disk-activity figures for September 11, to explain the warning email from that day.
     Before asking, look at the Disk IO panels in the dashboard for that day; if they now
     load, you may not need this part.
- **Why it matters:** The first item is a small security gap. It is low risk today, because
  nothing outside can reach that tool directly.
- **How urgent:** Whenever, but soon.

### 22. Language list data from SIL in a public repository (Decision)

- **Question:** Is it acceptable to keep SIL's language-grouping list (which languages belong
  to "Arabic", "Chinese" and so on) inside the project's code, given that the code is public?
- **My recommendation:** Move it out. Download the list from SIL each time the website's
  language pages are built, instead of storing a copy in the code. Or write to SIL and ask for
  written permission to keep it.
- **Why it matters:** SIL's terms of use say the code tables must not be redistributed and
  may only be downloaded from their site. The project's code is public on GitHub, so the copy
  in it could count as redistribution. The website pages themselves use the list with credit
  to SIL, which is less of a concern.
- **How urgent:** Whenever, but soon.

### 23. Size and type limits on the Bible audio storage (Decision)

- **Question:** Should the storage area for Bible audio refuse files over 50 MB and anything
  that is not audio?
- **My recommendation:** Yes, after checking that no current file is bigger than 50 MB. This
  was the plan all along; the limit was lost because the storage area was made by hand.
- **Why it matters:** Without limits, a mistake or a misused key could fill the storage with
  very large or wrong files, and cost money.
- **How urgent:** Whenever.

### 24. Delete the old backup tables (Decision)

- **Question:** Can the backup copies of user settings and plan progress made during this
  month's database repairs be deleted?
- **My recommendation:** Yes, about two weeks after the release, once the sync fixes have
  proven fine.
- **Why it matters:** They hold copies of real users' data. They are now cleaned when someone
  deletes their account, but they still hold everyone else's data for no reason.
- **How urgent:** Whenever (after the release).

### 25. Privacy lock: what to do if it fails (Decision)

- **Question:** If the privacy lock itself hits an error very early on start-up, should the app
  lock the screen to be safe?
- **My recommendation:** Yes. Lock whenever the lock has trouble, once the app knows privacy
  mode is on.
- **Why it matters:** Today, in that rare case, the app would stop re-locking for the rest of
  that session. It only matters if something else goes wrong first.
- **How urgent:** Whenever; in the next release if it is easy.

### 26. "Allow notifications" nudge for synced reminders (Decision)

- **Question:** If the daily reminder was turned on from another phone but this phone never
  allowed notifications, should the app ask for permission?
- **My recommendation:** Yes. Show a small "Allow notifications" notice in Settings. It needs a
  new sentence in 21 languages.
- **Why it matters:** Today that reminder is silently never shown on the second phone.
- **How urgent:** Whenever.

### 27. Admin site checks after today's fix (Action)

- **Question:** Will you check that the admin site now keeps you signed in?
- **My recommendation:** Sign in, come back after more than an hour, and confirm you are still
  signed in. The next morning, confirm the daily Bible catalog update ran (the admin site's
  sync history shows a new run after 06:00 UTC).
- **Why it matters:** Part of the admin site had never actually run since April, so admins
  were signed out early. It was fixed today, and switching it on could in theory affect the
  daily update.
- **How urgent:** This week.

### 28. Website: tell Google and Bing about the new pages (Action)

- **Question:** Will you submit the website's page list to Google Search Console and Bing
  Webmaster Tools?
- **My recommendation:** Yes. Submit `https://everybible.app/sitemap.xml`. There are now about
  9,800 language pages. Also re-check how links look when shared on Facebook, LinkedIn and X.
- **Why it matters:** Search engines find the new pages much faster when told.
- **How urgent:** Whenever.

### 29. Keep admins' emails in the admin history (Decision)

- **Question:** When an admin deletes their own account, should their email stay in the admin
  history log?
- **My recommendation:** Keep it. It shows who made each change, which is a valid security
  reason that both stores accept.
- **Why it matters:** Only admins are affected.
- **How urgent:** Whenever.

### 30. Reporting crashes outside the app's own code (Decision)

- **Question:** Do you want a crash-reporting service (such as Sentry or Crashlytics) for
  crashes that happen outside the app's own code?
- **My recommendation:** Not yet. See what the new App errors page in the admin site shows
  after the release first.
- **Why it matters:** The new error reports only catch problems in the app's own code. Crashes
  deeper in the phone's system parts still go unseen, except in Apple's and Google's own
  reports.
- **How urgent:** Whenever.

### 31. The 20 translated "What's New" texts (Action)

- **Question:** Should the "What's New" text be re-translated into the other 20 languages?
- **My recommendation:** Only when you add store listings in those languages. Today both store
  listings are English only. The English text was updated today; the other 20 still describe
  an earlier draft.
- **Why it matters:** Using the old translations would leave out today's changes.
- **How urgent:** Before any translated store listing goes live.

---

## Already decided (for the record)

- Translator access: one passcode per translation team, managed in the admin site (decided
  2026-09-24). Contributors' full names stay visible to translators.
- Android background audio: add lock-screen controls next to the existing player rather than
  replace the player.
- Moving sign-in restore after the first screen: not done for now. The offline delay it
  exposed was fixed separately.
- Groups: when a leader deletes their account, leadership passes to the longest-standing
  member instead of the whole group being deleted.
- Device backups: notes stay in the phone's own backups, and the sign-in token keeps its
  current setting, so people changing phones don't lose data or get signed out.
