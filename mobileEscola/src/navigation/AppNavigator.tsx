import React from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { PerformanceScreen } from '../features/desempenho/screens/PerformanceScreen';
import { SimuladosScreen } from '../features/simulados/screens/SimuladosScreen';
import { FinanceiroScreen } from '../features/financeiro/screens/FinanceiroScreen';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export type AppTabParamList = {
  Home: undefined;
  Desempenho: undefined;
  Simulados: undefined;
  Financeiro: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:        { active: 'home',           inactive: 'home-outline' },
  Desempenho:  { active: 'stats-chart',    inactive: 'stats-chart-outline' },
  Simulados:   { active: 'clipboard',      inactive: 'clipboard-outline' },
  Financeiro:  { active: 'wallet',         inactive: 'wallet-outline' },
};

export function AppNavigator() {
  const { signOut } = useAuth();

  function confirmarSair() {
    Alert.alert(
      'Sair',
      'Deseja realmente sair do aplicativo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: signOut },
      ]
    );
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6',
          paddingBottom: 4,
          height: 60,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name];
          const name = focused ? icons.active : icons.inactive;
          return <Ionicons name={name} size={size} color={color} />;
        },
        headerRight: () => (
          <TouchableOpacity onPress={confirmarSair} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color={colors.surface} />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Home"       component={HomeScreen}        options={{ title: 'Home', headerShown: false }} />
      <Tab.Screen name="Desempenho" component={PerformanceScreen} options={{ title: 'Desempenho', headerShown: false }} />
      <Tab.Screen name="Simulados"  component={SimuladosScreen}   options={{ title: 'Simulados' }} />
      <Tab.Screen name="Financeiro" component={FinanceiroScreen} options={{ title: 'Financeiro', headerShown: false }} />
    </Tab.Navigator>
  );
}
