# Actual Location Analytics Design

## Goal

Replace heat-map attribution based on `user_preferences.country_code` with actual coarse device-location data captured at event time for listening and download analytics.

## Product Outcome

- The admin globe reflects where activity actually happened, not what country a user selected during onboarding.
- The app stores only approximate geography, not precise GPS trails.
- Country selection remains a content and language preference only.

## Guardrails

- Foreground-only location access.
- Approximate/coarsened coordinates only.
- No background location collection.
- No precise path history.
- Clear user-facing disclosure in app settings and privacy policy.

## Technical Shape

### Mobile app

- Add `expo-location`.
- Prime an approximate location snapshot when the user starts a trackable foreground activity such as listening or downloading.
- Cache the snapshot briefly for the current session to avoid repeated prompts/lookups.
- Coarsen coordinates on-device before storing them.
- Attach the coarse location payload only to the analytics events that power geography reporting:
  - `audio_completed`
  - `audio_download_completed`
  - `text_translation_download_completed`

### Event payload

Attach these keys inside `event_properties`:

- `geo_latitude_bucket`
- `geo_longitude_bucket`
- `geo_country_code`
- `geo_country_name`
- `geo_label`
- `geo_accuracy_meters`
- `geo_source`

`geo_label` should remain human-readable and privacy-safe, for example `Approximate area near Kathmandu, Nepal`.

### Backend/admin

- Stop joining geography reporting to `user_preferences.country_code`.
- Aggregate a new `locationMetrics` collection from coarse event-time coordinates.
- Derive `countryMetrics` from the same event-time geo payload so the table and map use the same source of truth.
- Keep daily listening/download totals unchanged.

### UX/legal

- Add iOS/Android foreground location permission messaging for approximate activity-map usage.
- Add a settings entry that explains the map uses approximate device location.
- Update the website privacy policy to describe approximate location collection for analytics maps.
- Note for release: App Store Connect privacy answers must be updated before submission.

## Assumptions

- Approximate location within roughly 100-150 miles is acceptable.
- Event-time location is acceptable if some sessions remain unattributed due to denied permission or offline geocoder failures.
- Existing historical events cannot be retroactively corrected without true event-time location data.

## Verification

- Unit tests for coarse location bucketing and analytics payload shaping.
- Admin analytics tests for hotspot aggregation and country rollups from event geo payload.
- Expo config verification for new location permissions.
- Mobile/site/admin typecheck.
