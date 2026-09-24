#!/bin/sh
# Vercel "Ignored Build Step" for apps/site and apps/admin.
# Exit 0 = skip this deployment, exit 1 = build it.
#
# Why: every push to any branch used to rebuild both web apps (the site prebuilds
# ~2,600 language pages), which burned thousands of paid build minutes in a day
# of agent pushes. Only production (main) builds, and only when this app or a
# shared input actually changed since the last successful deployment.
# Usage (from the app's root directory): sh ../../scripts/vercel/should-build.sh

if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  echo "Skipping: branch '$VERCEL_GIT_COMMIT_REF' is not main (no preview builds)."
  exit 0
fi

BASE="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "Building: previous deployment commit $BASE is not in the clone."
  exit 1
fi

if git diff --quiet "$BASE" HEAD -- . ../../packages ../../package.json ../../package-lock.json ../../scripts/vercel ../../.vercelignore ../../turbo.json; then
  echo "Skipping: nothing this app depends on changed since $BASE."
  exit 0
fi

echo "Building: relevant changes since $BASE."
exit 1
