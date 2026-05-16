export type SetupMode = 'initial' | 'settings';

export type SetupStep = 'translation' | 'country' | 'contentLanguage';

export function getLocaleSetupSteps(mode: SetupMode): SetupStep[] {
  if (mode === 'settings') {
    return ['country', 'contentLanguage'];
  }

  return ['translation'];
}
