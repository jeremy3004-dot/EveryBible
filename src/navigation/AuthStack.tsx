import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="SignIn"
        getComponent={() => require('../screens/auth/SignInScreen').SignInScreen}
      />
      <Stack.Screen
        name="SignUp"
        getComponent={() => require('../screens/auth/SignUpScreen').SignUpScreen}
      />
    </Stack.Navigator>
  );
}
