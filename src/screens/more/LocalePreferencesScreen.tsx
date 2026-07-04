import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LocaleSetupFlow } from '../onboarding';
import type { MoreStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'LocalePreferences'>;

export function LocalePreferencesScreen() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <LocaleSetupFlow
      mode="settings"
      titleKey="settings.nationAndLanguage"
      onClose={() => navigation.goBack()}
      onComplete={() => navigation.goBack()}
    />
  );
}
