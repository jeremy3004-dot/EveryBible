import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LearnStackParamList } from './types';
import { CourseListScreen } from '../screens/learn/CourseListScreen';
import { CourseDetailScreen } from '../screens/learn/CourseDetailScreen';
import { LessonViewScreen } from '../screens/learn/LessonViewScreen';
import { FourFieldsJourneyScreen } from '../screens/learn/FourFieldsJourneyScreen';
import { FieldOverviewScreen } from '../screens/learn/FieldOverviewScreen';
import { FourFieldsLessonViewScreen } from '../screens/learn/FourFieldsLessonViewScreen';
import { GroupListScreen } from '../screens/learn/GroupListScreen';
import { GroupDetailScreen } from '../screens/learn/GroupDetailScreen';
import { GroupSessionScreen } from '../screens/learn/GroupSessionScreen';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<LearnStackParamList>();

export function LearnStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CourseList" component={CourseListScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="LessonView" component={LessonViewScreen} />
      <Stack.Screen name="FourFieldsJourney" component={FourFieldsJourneyScreen} />
      <Stack.Screen name="FieldOverview" component={FieldOverviewScreen} />
      <Stack.Screen name="FourFieldsLessonView" component={FourFieldsLessonViewScreen} />
      <Stack.Screen name="GroupList" component={GroupListScreen} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
      <Stack.Screen name="GroupSession" component={GroupSessionScreen} />
    </Stack.Navigator>
  );
}
