import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BibleStackParamList } from './types';
import { BibleBrowserScreen } from '../screens/bible/BibleBrowserScreen';
import { BibleReaderScreen } from '../screens/bible/BibleReaderScreen';
import { ChapterSelectorScreen } from '../screens/bible/ChapterSelectorScreen';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<BibleStackParamList>();

export function BibleStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="BibleBrowser" component={BibleBrowserScreen} />
      <Stack.Screen name="ChapterSelector" component={ChapterSelectorScreen} />
      <Stack.Screen name="BibleReader" component={BibleReaderScreen} />
    </Stack.Navigator>
  );
}
