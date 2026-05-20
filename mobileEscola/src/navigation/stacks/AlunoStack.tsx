import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { PerformanceScreen } from '../../features/desempenho/screens/PerformanceScreen';
import { AlterarSenhaScreen } from '../../features/home/screens/AlterarSenhaScreen';
import { SimuladosNavigator } from './SimuladosStack';
import type { SimuladosStackParamList } from './SimuladosStack';
import { FinanceiroScreen } from '../../features/financeiro/screens/FinanceiroScreen';
import { AlunoDrawerProvider } from '../../context/AlunoDrawerContext';
import { AlunoDrawer } from '../../components/navigation/AlunoDrawer';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export type AlunoTabParamList = {
  Home: undefined;
  Desempenho: undefined;
  Simulados: NavigatorScreenParams<SimuladosStackParamList> | undefined;
  Financeiro: undefined;
};

export type AlunoStackParamList = {
  AlunoTabs: NavigatorScreenParams<AlunoTabParamList> | undefined;
  AlterarSenha: undefined;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:       { active: 'home',           inactive: 'home-outline' },
  Desempenho: { active: 'stats-chart',    inactive: 'stats-chart-outline' },
  Simulados:  { active: 'clipboard',      inactive: 'clipboard-outline' },
  Financeiro: { active: 'wallet',         inactive: 'wallet-outline' },
};

const Tab = createBottomTabNavigator<AlunoTabParamList>();
const Stack = createNativeStackNavigator<AlunoStackParamList>();

function AlunoTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.surface,
        tabBarInactiveTintColor: '#C7D2FE',
        tabBarStyle: {
          backgroundColor: colors.primary,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 4,
        },
        tabBarLabelStyle: { fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name];
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home"       component={HomeScreen}          options={{ title: 'Home', headerShown: false }} />
      <Tab.Screen name="Desempenho" component={PerformanceScreen}   options={{ title: 'Desempenho', headerShown: false }} />
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

export function AlunoStack() {
  return (
    <AlunoDrawerProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationTypeForReplace: 'push',
        }}
      >
        <Stack.Screen name="AlunoTabs" component={AlunoTabs} />
        <Stack.Screen name="AlterarSenha" component={AlterarSenhaScreen} />
      </Stack.Navigator>
      <AlunoDrawer />
    </AlunoDrawerProvider>
  );
}
