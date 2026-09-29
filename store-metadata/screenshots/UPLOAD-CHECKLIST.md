# Store Screenshot Upload Checklist

Folders and order: `AUTHORITATIVE.md`.

## App Store Connect

1. Open the version being prepared (not a live one; live versions are locked).
2. For every display size that has a set (iPhone 6.9"/6.7", iPhone 6.5",
   iPad 12.9" and iPad Pro 3rd-gen 12.9"), delete what is there and upload the
   matching folder from `AUTHORITATIVE.md`, in order.
3. Before submitting, look at each slot once more: App Store Connect copies the
   previous version's screenshots forward, which is how the retired red set
   reached 1.0.11.

## Google Play

1. `npm run play:publish-listing` uploads `google-play-2026-09-25/` and the
   feature graphic. If the service account gets 403 on the listing, upload the
   same files by hand in Play Console > Store listing.
