import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
  Easing,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationState } from '@react-navigation/native';
import { useAlunoDrawer } from '../../context/AlunoDrawerContext';
import { useAuth } from '../../context/AuthContext';
import type { AlunoStackParamList, AlunoTabParamList } from '../../navigation/stacks/AlunoStack';
import { navigationRef } from '../../navigation/navigationRef';
import { useRootNavigationState } from '../../navigation/useRootNavigationState';
import { platformShadow } from '../../lib/shadow';
import { useThemeColors, useTenantTheme } from '../../context/TenantThemeContext';
import type { ThemeColors } from '../../theme';
import ConfirmModal from '../ConfirmModal';

const drawerShadow = platformShadow({ color: '#000000', opacity: 0.15, radius: 24, elevation: 12 });

type TabName = keyof AlunoTabParamList;
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type NavigationStateSnapshot = Partial<NavigationState> | undefined;

const DRAWER_WIDTH = 312;

type MenuId =
  | 'home'
  | 'calendario'
  | 'desempenho'
  | 'simulados'
  | 'provas-anteriores'
  | 'exercicios'
  | 'financeiro';

type MenuItem =
  | {
      id: MenuId;
      label: string;
      icon: IconName;
      tab: TabName;
      nestedScreen?: 'ProvasAnteriores' | 'Exercicios' | 'SimuladosList';
    }
  | { id: MenuId; label: string; icon: IconName; stack: keyof Pick<AlunoStackParamList, 'Calendario'> };

const PROVAS_ANTERIORES_SCREENS = new Set(['ProvasAnteriores', 'ProvaAnteriorDetalhe']);
const EXERCICIOS_SCREENS = new Set(['Exercicios']);
const SIMULADOS_SCREENS = new Set(['SimuladosList', 'SimuladoDetalhe', 'SimuladoExam']);

const MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: 'Início', tab: 'Home', icon: 'home-outline' },
  { id: 'calendario', label: 'Calendário', stack: 'Calendario', icon: 'calendar-outline' },
  { id: 'desempenho', label: 'Desempenho', tab: 'Desempenho', icon: 'stats-chart-outline' },
  { id: 'simulados', label: 'Simulados', tab: 'Simulados', icon: 'clipboard-outline' },
  { id: 'provas-anteriores', label: 'Provas anteriores', tab: 'Simulados', nestedScreen: 'ProvasAnteriores', icon: 'archive-outline' },
  { id: 'exercicios', label: 'Exercícios', tab: 'Simulados', nestedScreen: 'Exercicios', icon: 'create-outline' },
  { id: 'financeiro', label: 'Financeiro', tab: 'Financeiro', icon: 'wallet-outline' },
];

function isAlunoTabName(name: string | undefined): name is TabName {
  return name === 'Home' || name === 'Desempenho' || name === 'Simulados' || name === 'Financeiro';
}

function getActiveSimuladosScreen(state: NavigationStateSnapshot): {
  name: string;
  params?: { listScreen?: string };
} | null {
  const routes = state?.routes;
  if (!routes?.length) return null;

  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name !== 'AlunoTabs') return null;

  const tabState = stackRoute.state as {
    index?: number;
    routes?: Array<{
      name?: string;
      state?: {
        index?: number;
        routes?: Array<{ name?: string; params?: { listScreen?: string } }>;
      };
    }>;
  } | undefined;
  const tabRoutes = tabState?.routes;
  if (!tabRoutes?.length) return null;

  const tabRoute = tabRoutes[tabState?.index ?? 0] ?? tabRoutes[0];
  if (tabRoute?.name !== 'Simulados') return null;

  const simState = tabRoute.state;
  const simRoutes = simState?.routes;
  if (!simRoutes?.length) return { name: 'SimuladosList' };

  const simRoute = simRoutes[simState?.index ?? 0] ?? simRoutes[0];
  return {
    name: simRoute?.name ?? 'SimuladosList',
    params: simRoute?.params as { listScreen?: string } | undefined,
  };
}

function getActiveMenuId(state: NavigationStateSnapshot): MenuId | null {
  const routes = state?.routes;
  if (!routes?.length) return 'home';

  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name === 'Calendario') return 'calendario';
  if (stackRoute?.name !== 'AlunoTabs') return null;

  const activeTab = getActiveTabName(state);
  if (!activeTab) return 'home';

  if (activeTab === 'Simulados') {
    const simScreen = getActiveSimuladosScreen(state);
    if (!simScreen) return 'simulados';
    if (simScreen.name === 'Exercicios') return 'exercicios';
    if (
      simScreen.name === 'ProvaAnteriorDetalhe' &&
      simScreen.params?.listScreen === 'Exercicios'
    ) {
      return 'exercicios';
    }
    if (PROVAS_ANTERIORES_SCREENS.has(simScreen.name)) return 'provas-anteriores';
    if (EXERCICIOS_SCREENS.has(simScreen.name)) return 'exercicios';
    if (SIMULADOS_SCREENS.has(simScreen.name)) return 'simulados';
    return 'simulados';
  }

  const tabMenuMap: Record<TabName, MenuId> = {
    Home: 'home',
    Desempenho: 'desempenho',
    Simulados: 'simulados',
    Financeiro: 'financeiro',
  };

  return tabMenuMap[activeTab] ?? null;
}

function getActiveTabName(state: NavigationStateSnapshot): TabName | null {
  const routes = state?.routes;
  if (!routes?.length) return null;

  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name !== 'AlunoTabs') return null;

  const tabState = stackRoute.state as { index?: number; routes?: Array<{ name?: string }> } | undefined;
  const tabRoutes = tabState?.routes;
  if (!tabRoutes?.length) return 'Home';

  const tabRoute = tabRoutes[tabState?.index ?? 0] ?? tabRoutes[0];

  return isAlunoTabName(tabRoute?.name) ? tabRoute.name : 'Home';
}

export function AlunoDrawer() {
  const colors = useThemeColors();
  const { logoUrl, tenantName } = useTenantTheme();
  const styles = useMemo(() => createAlunoDrawerStyles(colors), [colors]);
  const { visible, close } = useAlunoDrawer();
  const { signOut } = useAuth();
  const rootNavState = useRootNavigationState();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(DRAWER_WIDTH, width * 0.86);
  const activeMenuId = getActiveMenuId(rootNavState as NavigationStateSnapshot);
  const [shouldRender, setShouldRender] = useState(visible);
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) return;

    translateX.stopAnimation();
    backdropOpacity.stopAnimation();

    if (visible) {
      translateX.setValue(-drawerWidth);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -drawerWidth,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setShouldRender(false);
      }
    });
  }, [visible, shouldRender, translateX, backdropOpacity, drawerWidth]);

  function handleAlterarSenha() {
    close();
    if (navigationRef.isReady()) {
      navigationRef.navigate('AlterarSenha');
    }
  }

  function handleMenuPress(item: MenuItem) {
    close();
    if (!navigationRef.isReady()) return;

    if ('stack' in item) {
      navigationRef.navigate(item.stack);
      return;
    }

    if ('tab' in item && item.tab === 'Simulados') {
      navigationRef.navigate('AlunoTabs', {
        screen: item.tab,
        params: { screen: item.nestedScreen ?? 'SimuladosList' },
      });
      return;
    }

    navigationRef.navigate('AlunoTabs', { screen: item.tab });
  }

  function handleSair() {
    setConfirmLogoutVisible(true);
  }

  function handleConfirmarSair() {
    setConfirmLogoutVisible(false);
    close();
    void signOut();
  }

  return (
    <>
    <Modal visible={shouldRender} transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              paddingTop: insets.top,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.drawerTopLight}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTituloLight}>Menu</Text>
                <Text style={styles.drawerSubtituloLight}>Acesso rápido</Text>
              </View>
              <TouchableOpacity
                onPress={close}
                style={styles.fecharBtnLight}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <View style={styles.logoSection}>
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={styles.logoImage}
                  resizeMode="contain"
                  accessibilityLabel={tenantName ? `Logo ${tenantName}` : 'Logo da escola'}
                />
              ) : (
                <Text style={styles.logoFallback} numberOfLines={2}>
                  {tenantName ?? 'App Escola'}
                </Text>
              )}
            </View>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.secao}>
              <Text style={styles.secaoLabel}>Navegação</Text>
              <View style={styles.menuPrincipal}>
                {MENU_ITEMS.map((item) => {
                  const active = item.id === activeMenuId;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.navItem, active && styles.navItemAtivo]}
                      onPress={() => handleMenuPress(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.navIcone, active && styles.navIconeAtivo]}>
                        <Ionicons
                          name={item.icon}
                          size={19}
                          color={active ? colors.menu_button_active_icon : colors.menu_button_icon}
                        />
                      </View>
                      <View style={styles.navTextoWrap}>
                        <Text style={[styles.navTitulo, active && styles.navTituloAtivo]}>{item.label}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={active ? colors.menu_button_active_chevron : colors.menu_button_chevron}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.menu}>
            <Text style={styles.secaoLabel}>Conta</Text>
            <TouchableOpacity style={styles.menuItem} onPress={handleAlterarSenha} activeOpacity={0.75}>
              <Ionicons name="key-outline" size={19} color={colors.menu_button_icon} />
              <Text style={styles.menuItemTexto}>Trocar senha</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.menu_button_chevron} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, styles.menuItemSair]} onPress={handleSair} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={19} color={colors.debit} />
              <Text style={[styles.menuItemTexto, styles.menuItemSairTexto]}>Sair</Text>
            </TouchableOpacity>
          </View>
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
      iconColor={colors.debit}
      onConfirm={handleConfirmarSair}
      onCancel={() => setConfirmLogoutVisible(false)}
    />
    </>
  );
}

function createAlunoDrawerStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    ...(drawerShadow as object),
  },
  drawerTopLight: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  drawerTituloLight: { fontSize: 18, fontWeight: '800', color: colors.ink },
  drawerSubtituloLight: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  fecharBtnLight: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    minHeight: 108,
  },
  logoImage: {
    width: '100%',
    height: 96,
    maxWidth: 240,
  },
  logoFallback: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  drawerScroll: { flex: 1 },
  drawerScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  secao: { gap: 8 },
  secaoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.drawer_section_label,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  menuPrincipal: { gap: 7 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.menu_button_background,
    borderWidth: 1,
    borderColor: colors.menu_button_background,
  },
  navItemAtivo: {
    backgroundColor: colors.menu_button_active_background,
    borderColor: colors.menu_button_active_background,
  },
  navIcone: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.menu_button_icon_background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconeAtivo: { backgroundColor: colors.menu_button_active_icon_background },
  navTextoWrap: { flex: 1, minWidth: 0 },
  navTitulo: { fontSize: 13, fontWeight: '800', color: colors.menu_button_text },
  navTituloAtivo: { color: colors.menu_button_active_text },
  menu: {
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    backgroundColor: colors.primary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.menu_button_background,
    borderWidth: 1,
    borderColor: colors.menu_button_background,
  },
  menuItemTexto: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.menu_button_text },
  menuItemSair: { backgroundColor: colors.menu_button_background, borderColor: colors.menu_button_background },
  menuItemSairTexto: { color: colors.debit },
});
}
