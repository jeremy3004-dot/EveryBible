import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreStackParamList } from './types';
import { MoreScreen } from '../screens/more/MoreScreen';
import { SettingsScreen } from '../screens/more/SettingsScreen';
import { LocalePreferencesScreen } from '../screens/more/LocalePreferencesScreen';
import { PrivacyPreferencesScreen } from '../screens/more/PrivacyPreferencesScreen';
import { ProfileScreen } from '../screens/more/ProfileScreen';
import { ReadingActivityScreen } from '../screens/more/ReadingActivityScreen';
import { AboutScreen } from '../screens/more/AboutScreen';
import { AuthStack } from './AuthStack';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MoreScreen" component={MoreScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="LocalePreferences" component={LocalePreferencesScreen} />
      <Stack.Screen name="PrivacyPreferences" component={PrivacyPreferencesScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ReadingActivity" component={ReadingActivityScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Auth" component={AuthStack} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
