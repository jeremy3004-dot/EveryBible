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
    </Stack.Navigator>
  );
}
