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
        name="GatherHome"
        getComponent={() => require('../screens/learn/GatherScreen').GatherScreen}
      />
      <Stack.Screen
        name="FoundationDetail"
        getComponent={() =>
          require('../screens/learn/FoundationDetailScreen').FoundationDetailScreen
        }
      />
      <Stack.Screen
        name="LessonDetail"
        getComponent={() => require('../screens/learn/LessonDetailScreen').LessonDetailScreen}
      />
      <Stack.Screen
        name="PrayerWall"
        getComponent={() => require('../screens/learn/PrayerWallScreen').PrayerWallScreen}
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
