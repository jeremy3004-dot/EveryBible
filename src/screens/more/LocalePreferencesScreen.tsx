import { useNavigation } from '@react-navigation/native';
import { LocaleSetupFlow } from '../onboarding';

export function LocalePreferencesScreen() {
  const navigation = useNavigation();

  return (
    <LocaleSetupFlow
      mode="settings"
      titleKey="settings.nationAndLanguage"
      onClose={() => navigation.goBack()}
      onComplete={() => navigation.goBack()}
    />
  );
}
