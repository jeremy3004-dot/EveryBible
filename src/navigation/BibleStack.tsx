import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BibleStackParamList } from './types';
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
      <Stack.Screen
        name="BibleBrowser"
        getComponent={() => require('../screens/bible/BibleBrowserScreen').BibleBrowserScreen}
      />
      <Stack.Screen
        name="ChapterSelector"
        getComponent={() => require('../screens/bible/ChapterSelectorScreen').ChapterSelectorScreen}
      />
      <Stack.Screen
        name="BibleReader"
        getComponent={() => require('../screens/bible/BibleReaderScreen').BibleReaderScreen}
      />
    </Stack.Navigator>
  );
}
