import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { PublicRegisterScreen } from '../features/auth/screens/PublicRegisterScreen';

export type AuthStackParamList = {
  Login: undefined;
  PublicRegister: { tenantSlug?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PublicRegister" component={PublicRegisterScreen} />
    </Stack.Navigator>
  );
}
