import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BibleStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';
import { renderScreenWithErrorBoundary } from './screenErrorLayout';

const Stack = createNativeStackNavigator<BibleStackParamList>();

export function BibleStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenLayout={renderScreenWithErrorBoundary}
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
        name="BiblePicker"
        getComponent={() => require('../screens/bible/BibleBrowserScreen').BibleBrowserScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="ChapterSelector"
        getComponent={() => require('../screens/bible/ChapterSelectorScreen').ChapterSelectorScreen}
      />
      <Stack.Screen
        name="BibleReader"
        getComponent={() => require('./bibleReaderRouteGuard').BibleReaderRoute}
      />
      <Stack.Screen
        name="TranslatorQueue"
        getComponent={() =>
          require('../screens/bible/TranslatorReviewQueueScreen').TranslatorReviewQueueScreen
        }
      />
      <Stack.Screen
        name="ChapterFeedbackReview"
        getComponent={() =>
          require('../screens/bible/ChapterFeedbackReviewScreen').ChapterFeedbackReviewScreen
        }
      />
    </Stack.Navigator>
  );
}
