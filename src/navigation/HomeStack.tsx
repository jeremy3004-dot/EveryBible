import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="HomeScreen"
        getComponent={() => require('../screens/home/HomeScreen').HomeScreen}
      />
    </Stack.Navigator>
  );
}
