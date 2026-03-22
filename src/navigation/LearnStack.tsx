import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LearnStackParamList } from './types';
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
      <Stack.Screen
        name="CourseList"
        getComponent={() => require('../screens/learn/CourseListScreen').CourseListScreen}
      />
      <Stack.Screen
        name="PrayerWall"
        getComponent={() => require('../screens/learn/PrayerWallScreen').PrayerWallScreen}
      />
      <Stack.Screen
        name="ReadingPlanList"
        getComponent={() => require('../screens/learn/ReadingPlanListScreen').ReadingPlanListScreen}
      />
      <Stack.Screen
        name="ReadingPlanDetail"
        getComponent={() =>
          require('../screens/learn/ReadingPlanDetailScreen').ReadingPlanDetailScreen
        }
      />
      <Stack.Screen
        name="CourseDetail"
        getComponent={() => require('../screens/learn/CourseDetailScreen').CourseDetailScreen}
      />
      <Stack.Screen
        name="LessonView"
        getComponent={() => require('../screens/learn/LessonViewScreen').LessonViewScreen}
      />
      <Stack.Screen
        name="FourFieldsJourney"
        getComponent={() =>
          require('../screens/learn/FourFieldsJourneyScreen').FourFieldsJourneyScreen
        }
      />
      <Stack.Screen
        name="FieldOverview"
        getComponent={() => require('../screens/learn/FieldOverviewScreen').FieldOverviewScreen}
      />
      <Stack.Screen
        name="FourFieldsLessonView"
        getComponent={() =>
          require('../screens/learn/FourFieldsLessonViewScreen').FourFieldsLessonViewScreen
        }
      />
      <Stack.Screen
        name="GroupList"
        getComponent={() => require('../screens/learn/GroupListScreen').GroupListScreen}
      />
      <Stack.Screen
        name="GroupDetail"
        getComponent={() => require('../screens/learn/GroupDetailScreen').GroupDetailScreen}
      />
      <Stack.Screen
        name="GroupSession"
        getComponent={() => require('../screens/learn/GroupSessionScreen').GroupSessionScreen}
      />
    </Stack.Navigator>
  );
}
