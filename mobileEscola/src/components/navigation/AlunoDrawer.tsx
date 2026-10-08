import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationState } from '@react-navigation/native';
import { useAlunoDrawer } from '../../context/AlunoDrawerContext';
import { useAuth } from '../../context/AuthContext';
import type { AlunoStackParamList, AlunoTabParamList } from '../../navigation/stacks/AlunoStack';
import { navigationRef } from '../../navigation/navigationRef';
import { useRootNavigationState } from '../../navigation/useRootNavigationState';
import { useTenantTheme } from '../../context/TenantThemeContext';
import ConfirmModal from '../ConfirmModal';
import { IconButton, ListItem, Overline, Txt, radius, shadow, space, type, usePalette, type IconName } from '../../ui';

type TabName = keyof AlunoTabParamList;
type NavigationStateSnapshot = Partial<NavigationState> | undefined;

const DRAWER_WIDTH = 312;

type MenuId =
  | 'home' | 'calendario' | 'desempenho' | 'questoes' | 'simulados' | 'provas-anteriores' | 'exercicios' | 'materiais' | 'financeiro';

type MenuItem =
  | { id: MenuId; label: string; icon: IconName; tab: TabName; nestedScreen?: 'ProvasAnteriores' | 'Exercicios' | 'Materiais' | 'SimuladosList' }
  | { id: MenuId; label: string; icon: IconName; stack: keyof Pick<AlunoStackParamList, 'Calendario'> };

const PROVAS_ANTERIORES_SCREENS = new Set(['ProvasAnteriores', 'ProvaAnteriorDetalhe']);

const MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: 'Início', tab: 'Home', icon: 'home' },
  { id: 'calendario', label: 'Calendário', stack: 'Calendario', icon: 'calendar' },
  { id: 'desempenho', label: 'Desempenho', tab: 'Desempenho', icon: 'chart' },
  { id: 'questoes', label: 'Banco de questões', tab: 'Questoes', icon: 'library' },
  { id: 'simulados', label: 'Simulados', tab: 'Simulados', icon: 'clipboard' },
  { id: 'provas-anteriores', label: 'Provas anteriores', tab: 'Simulados', nestedScreen: 'ProvasAnteriores', icon: 'archive' },
  { id: 'exercicios', label: 'Exercícios', tab: 'Simulados', nestedScreen: 'Exercicios', icon: 'edit' },
  { id: 'materiais', label: 'Materiais', tab: 'Simulados', nestedScreen: 'Materiais', icon: 'folder' },
  { id: 'financeiro', label: 'Financeiro', tab: 'Financeiro', icon: 'wallet' },
];

const TAB_NAMES: TabName[] = ['Home', 'Desempenho', 'Questoes', 'Simulados', 'Financeiro'];

function getActiveTabRoute(state: NavigationStateSnapshot) {
  const routes = state?.routes;
  if (!routes?.length) return null;
  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name !== 'AlunoTabs') return null;
  const tabState = stackRoute.state as { index?: number; routes?: Array<{ name?: string; state?: { index?: number; routes?: Array<{ name?: string; params?: { listScreen?: string } }> } }> } | undefined;
  const tabRoutes = tabState?.routes;
  if (!tabRoutes?.length) return { name: 'Home' as TabName, state: undefined };
  const tabRoute = tabRoutes[tabState?.index ?? 0] ?? tabRoutes[0];
  const name = TAB_NAMES.includes(tabRoute?.name as TabName) ? (tabRoute.name as TabName) : 'Home';
  return { name, state: tabRoute.state };
}

/** Item ativo do menu a partir do estado de navegação (inclusive telas internas de Simulados). */
function getActiveMenuId(state: NavigationStateSnapshot): MenuId | null {
  const routes = state?.routes;
  if (!routes?.length) return 'home';
  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name === 'Calendario') return 'calendario';
  const tab = getActiveTabRoute(state);
  if (!tab) return null;
  if (tab.name === 'Simulados') {
    const simRoutes = tab.state?.routes;
    const simRoute = simRoutes?.[tab.state?.index ?? 0];
    const name = simRoute?.name ?? 'SimuladosList';
    const listScreen = simRoute?.params?.listScreen;
    if (name === 'Exercicios' || (name === 'ProvaAnteriorDetalhe' && listScreen === 'Exercicios')) return 'exercicios';
    if (name === 'Materiais' || (name === 'ProvaAnteriorDetalhe' && listScreen === 'Materiais')) return 'materiais';
    if (PROVAS_ANTERIORES_SCREENS.has(name)) return 'provas-anteriores';
    return 'simulados';
  }
  return ({ Home: 'home', Desempenho: 'desempenho', Questoes: 'questoes', Financeiro: 'financeiro' } as Record<string, MenuId>)[tab.name] ?? null;
}

function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'U') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Menu lateral (protótipo "TelaMenu"): itens soltos, cor só no ativo. */
export function AlunoDrawer() {
  const p = usePalette();
  const { logoUrl, tenantName } = useTenantTheme();
  const { visible, close } = useAlunoDrawer();
  const { signOut, user } = useAuth();
  const rootNavState = useRootNavigationState();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(DRAWER_WIDTH, width * 0.86);
  const activeMenuId = getActiveMenuId(rootNavState as NavigationStateSnapshot);
  const [shouldRender, setShouldRender] = useState(visible);
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const enrollment = user?.student?.enrollment_number ?? null;

  useEffect(() => {
    if (visible) setShouldRender(true);
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) return;
    translateX.stopAnimation();
    backdropOpacity.stopAnimation();
    if (visible) {
      translateX.setValue(-drawerWidth);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(translateX, { toValue: -drawerWidth, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [visible, shouldRender, translateX, backdropOpacity, drawerWidth]);

  function handleMenuPress(item: MenuItem) {
    close();
    if (!navigationRef.isReady()) return;
    if ('stack' in item) {
      navigationRef.navigate(item.stack);
      return;
    }
    if (item.tab === 'Simulados') {
      navigationRef.navigate('AlunoTabs', { screen: 'Simulados', params: { screen: item.nestedScreen ?? 'SimuladosList' } });
      return;
    }
    if (item.tab === 'Questoes') {
      navigationRef.navigate('AlunoTabs', { screen: 'Questoes', params: { screen: 'BancoQuestoes' } });
      return;
    }
    navigationRef.navigate('AlunoTabs', { screen: item.tab });
  }

  function handleAlterarSenha() {
    close();
    if (navigationRef.isReady()) navigationRef.navigate('AlterarSenha');
  }

  return (
    <>
      <Modal visible={shouldRender} transparent animationType="none" onRequestClose={close}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim, opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fechar menu" />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel="Menu"
            style={[{
              width: drawerWidth, height: '100%', backgroundColor: p.surface,
              paddingTop: insets.top + space[2], paddingBottom: Math.max(insets.bottom, space[6]), paddingHorizontal: space[2],
              transform: [{ translateX }],
            }, shadow.sheet]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space[2], paddingLeft: space[3], paddingRight: space[1] }}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} resizeMode="contain" accessibilityLabel={tenantName ? `Logo ${tenantName}` : 'Logo da escola'}
                  style={{ height: 32, width: 160 }} />
              ) : (
                <Text numberOfLines={1} style={{ fontSize: 20, lineHeight: 24, fontFamily: type.display.fontFamily, letterSpacing: -0.2, color: p.ink, flexShrink: 1 }}>
                  {tenantName ?? 'App Escola'}
                </Text>
              )}
              <IconButton icon="x" label="Fechar menu" onPress={close} />
            </View>

            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', marginVertical: space[2], marginHorizontal: space[1], padding: space[3], borderRadius: radius.md, backgroundColor: p.surfaceSunken }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: type.display.fontFamily, fontSize: 14, color: p.inkMuted }}>{initials(user?.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{user?.name ?? 'Aluno'}</Txt>
                {enrollment ? <Txt variant="bodySm" tone="subtle" numberOfLines={1}>Matrícula {enrollment}</Txt> : null}
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
              <Overline style={{ paddingTop: space[4], paddingBottom: 6, paddingHorizontal: space[3] }}>Navegação</Overline>
              {MENU_ITEMS.map((item) => (
                <ListItem key={item.id} icon={item.icon} title={item.label} chevron={false} active={item.id === activeMenuId} onPress={() => handleMenuPress(item)} />
              ))}
              <Overline style={{ paddingTop: space[4], paddingBottom: 6, paddingHorizontal: space[3] }}>Conta</Overline>
              <ListItem icon="key" title="Trocar senha" chevron={false} onPress={handleAlterarSenha} />
              <ListItem icon="logout" title="Sair" tone="danger" onPress={() => setConfirmLogoutVisible(true)} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <ConfirmModal
        visible={confirmLogoutVisible}
        title="Sair"
        message="Deseja sair do aplicativo?"
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        confirmDestructive
        icon="log-out-outline"
        iconColor={p.danger}
        onConfirm={() => {
          setConfirmLogoutVisible(false);
          close();
          void signOut();
        }}
        onCancel={() => setConfirmLogoutVisible(false)}
      />
    </>
  );
}
