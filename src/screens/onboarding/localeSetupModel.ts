export type SetupMode = 'initial' | 'settings';

export type SetupStep = 'interface' | 'account' | 'country' | 'contentLanguage';

export function getLocaleSetupSteps(mode: SetupMode): SetupStep[] {
  if (mode === 'settings') {
    return ['country', 'contentLanguage'];
  }

  return ['interface', 'account', 'country', 'contentLanguage'];
}
