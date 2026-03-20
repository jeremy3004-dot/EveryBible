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
    </Stack.Navigator>
  );
}
