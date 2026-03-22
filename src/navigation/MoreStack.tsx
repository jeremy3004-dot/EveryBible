import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreStackParamList } from './types';
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
      <Stack.Screen
        name="MoreScreen"
        getComponent={() => require('../screens/more/MoreScreen').MoreScreen}
      />
      <Stack.Screen
        name="Settings"
        getComponent={() => require('../screens/more/SettingsScreen').SettingsScreen}
      />
      <Stack.Screen
        name="LocalePreferences"
        getComponent={() =>
          require('../screens/more/LocalePreferencesScreen').LocalePreferencesScreen
        }
      />
      <Stack.Screen
        name="PrivacyPreferences"
        getComponent={() =>
          require('../screens/more/PrivacyPreferencesScreen').PrivacyPreferencesScreen
        }
      />
      <Stack.Screen
        name="Profile"
        getComponent={() => require('../screens/more/ProfileScreen').ProfileScreen}
      />
      <Stack.Screen
        name="ReadingActivity"
        getComponent={() => require('../screens/more/ReadingActivityScreen').ReadingActivityScreen}
      />
      <Stack.Screen
        name="Annotations"
        getComponent={() => require('../screens/more/AnnotationsScreen').AnnotationsScreen}
      />
      <Stack.Screen
        name="TranslationBrowser"
        getComponent={() =>
          require('../screens/more/TranslationBrowserScreen').TranslationBrowserScreen
        }
      />
      <Stack.Screen
        name="About"
        getComponent={() => require('../screens/more/AboutScreen').AboutScreen}
      />
      <Stack.Screen
        name="Auth"
        getComponent={() => require('./AuthStack').AuthStack}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
