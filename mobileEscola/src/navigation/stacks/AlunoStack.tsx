import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { PerformanceScreen } from '../../features/desempenho/screens/PerformanceScreen';
import { AlterarSenhaScreen } from '../../features/home/screens/AlterarSenhaScreen';
import { SimuladosNavigator } from './SimuladosStack';
import type { SimuladosStackParamList } from './SimuladosStack';
import { QuestoesNavigator, type QuestoesStackParamList } from './QuestoesStack';
import { FinanceiroScreen } from '../../features/financeiro/screens/FinanceiroScreen';
import { NotificationsListScreen } from '../../features/notifications/screens/NotificationsListScreen';
import { NotificationDetailScreen } from '../../features/notifications/screens/NotificationDetailScreen';
import { CalendarScreen } from '../../features/calendar/screens/CalendarScreen';
import { AlunoDrawerProvider } from '../../context/AlunoDrawerContext';
import { TenantThemeProvider } from '../../context/TenantThemeContext';
import { AlunoDrawer } from '../../components/navigation/AlunoDrawer';
import { StatusBar } from 'expo-status-bar';
import { TabBar, usePalette, type TabItem } from '../../ui';

export type AlunoTabParamList = {
  Home: undefined;
  Desempenho: undefined;
  Questoes: NavigatorScreenParams<QuestoesStackParamList> | undefined;
  Simulados: NavigatorScreenParams<SimuladosStackParamList> | undefined;
  Financeiro: undefined;
};

export type AlunoStackParamList = {
  AlunoTabs: NavigatorScreenParams<AlunoTabParamList> | undefined;
  AlterarSenha: undefined;
  Notificacoes: undefined;
  NotificacaoDetalhe: { notificationId: number };
  Calendario: { selectedDate?: string } | undefined;
};

const TABS: TabItem[] = [
  { key: 'Home', icon: 'home', label: 'Início' },
  { key: 'Desempenho', icon: 'chart', label: 'Desempenho' },
  { key: 'Questoes', icon: 'library', label: 'Questões' },
  { key: 'Simulados', icon: 'clipboard', label: 'Simulados' },
  { key: 'Financeiro', icon: 'wallet', label: 'Financeiro' },
];

/** Telas raiz de cada aba: tocar na aba ativa volta à raiz dela. */
const TAB_ROOT: Record<string, string | undefined> = { Questoes: 'BancoQuestoes', Simulados: 'SimuladosList' };

const Tab = createBottomTabNavigator<AlunoTabParamList>();
const Stack = createNativeStackNavigator<AlunoStackParamList>();

function AlunoTabs() {
  const palette = usePalette();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          items={TABS}
          activeKey={state.routes[state.index]?.name ?? 'Home'}
          onPress={(key) => {
            const root = TAB_ROOT[key];
            if (root) navigation.navigate(key, { screen: root });
            else navigation.navigate(key);
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Desempenho" component={PerformanceScreen} />
      <Tab.Screen name="Questoes" component={QuestoesNavigator} />
      <Tab.Screen name="Simulados" component={SimuladosNavigator} />
      <Tab.Screen name="Financeiro" component={FinanceiroScreen} />
    </Tab.Navigator>
  );
}

export function AlunoStack() {
  return (
    <TenantThemeProvider>
      <AlunoDrawerProvider>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationTypeForReplace: 'push',
          }}
        >
          <Stack.Screen name="AlunoTabs" component={AlunoTabs} />
          <Stack.Screen name="AlterarSenha" component={AlterarSenhaScreen} />
          <Stack.Screen name="Notificacoes" component={NotificationsListScreen} />
          <Stack.Screen name="NotificacaoDetalhe" component={NotificationDetailScreen} />
          <Stack.Screen name="Calendario" component={CalendarScreen} />
        </Stack.Navigator>
        <AlunoDrawer />
      </AlunoDrawerProvider>
    </TenantThemeProvider>
  );
}
