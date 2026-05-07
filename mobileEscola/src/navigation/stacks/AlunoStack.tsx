import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { SimuladosNavigator } from './SimuladosStack';
import type { SimuladosStackParamList } from './SimuladosStack';
import { FinanceiroScreen } from '../../features/financeiro/screens/FinanceiroScreen';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme';

type AlunoTabParamList = {
  Home: undefined;
  Simulados: NavigatorScreenParams<SimuladosStackParamList> | undefined;
  Financeiro: undefined;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:       { active: 'home',      inactive: 'home-outline' },
  Simulados:  { active: 'clipboard', inactive: 'clipboard-outline' },
  Financeiro: { active: 'wallet',    inactive: 'wallet-outline' },
};

const Tab = createBottomTabNavigator<AlunoTabParamList>();

export function AlunoStack() {
  const { signOut } = useAuth();

  function confirmarSair() {
    Alert.alert('Sair', 'Deseja sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: '#F3F4F6', height: 60, paddingBottom: 4 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name];
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
        headerRight: () => (
          <TouchableOpacity onPress={confirmarSair} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color={colors.surface} />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Home"       component={HomeScreen}          options={{ title: 'Home', headerShown: false }} />
      <Tab.Screen
        name="Simulados"
        component={SimuladosNavigator}
        options={{ title: 'Simulados', headerShown: false }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Simulados', { screen: 'SimuladosList' });
          },
        })}
      />
      <Tab.Screen name="Financeiro" component={FinanceiroScreen}    options={{ title: 'Financeiro', headerShown: false }} />
    </Tab.Navigator>
  );
}
