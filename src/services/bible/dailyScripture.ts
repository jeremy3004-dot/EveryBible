export function shouldLoadDailyScriptureText({
  translationHasText,
  isBibleReady,
  allowInitialization,
}: {
  translationHasText: boolean;
  isBibleReady: boolean;
  allowInitialization: boolean;
}) {
  if (!translationHasText) {
    return false;
  }

  if (isBibleReady) {
    return true;
  }

  return allowInitialization;
}
