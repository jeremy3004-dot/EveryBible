import { renderTabScreenLayout } from './TabScreenLayout';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlansStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<PlansStackParamList>();

export function PlansStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenLayout={renderTabScreenLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="PlansHome"
        getComponent={() => require('../screens/plans/PlansHomeScreen').PlansHomeScreen}
      />
      <Stack.Screen
        name="PlanDetail"
        getComponent={() => require('../screens/plans/PlanDetailScreen').PlanDetailScreen}
      />
      <Stack.Screen
        name="RhythmDetail"
        getComponent={() => require('../screens/plans/RhythmDetailScreen').RhythmDetailScreen}
      />
      <Stack.Screen
        name="RhythmComposer"
        getComponent={() => require('../screens/plans/RhythmComposerScreen').RhythmComposerScreen}
      />
    </Stack.Navigator>
  );
}
