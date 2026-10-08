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
import { TabBar, useLayoutMode, usePalette, type TabItem } from '../../ui';
import { AlunoShell } from '../aluno/AlunoShell';
import { FOCUS_SCREENS } from '../aluno/menu';

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

type TabSnapshot = { index: number; routes: Array<{ state?: { index?: number; routes?: Array<{ name?: string }> } }> };
function isFocusTabState(state: TabSnapshot) {
  const inner = state.routes[state.index]?.state;
  const name = inner?.routes?.[inner.index ?? 0]?.name;
  return !!name && FOCUS_SCREENS.has(name);
}

function AlunoTabs() {
  const palette = usePalette();
  const { isMobile } = useLayoutMode();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg } }}
      // Tab bar só no celular; do tablet em diante a navegação é a SideNav (AlunoShell).
      // Telas de foco (responder simulado/sessão) também escondem a tab bar.
      tabBar={({ state, navigation }) => !isMobile || isFocusTabState(state) ? null : (
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
        <AlunoShell>
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
        </AlunoShell>
        <AlunoDrawer />
      </AlunoDrawerProvider>
    </TenantThemeProvider>
  );
}
