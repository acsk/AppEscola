import React, { useEffect, useRef, useState } from 'react';
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
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAlunoDrawer } from '../../context/AlunoDrawerContext';
import { useAuth } from '../../context/AuthContext';
import type { AlunoStackParamList, AlunoTabParamList } from '../../navigation/stacks/AlunoStack';
import { platformShadow } from '../../lib/shadow';
import { colors } from '../../theme';

const drawerShadow = platformShadow({ color: '#000000', opacity: 0.15, radius: 24, elevation: 12 });

type Nav = NativeStackNavigationProp<AlunoStackParamList>;
type TabName = keyof AlunoTabParamList;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DRAWER_WIDTH = 312;

const MENU_ITEMS: Array<{ label: string; screen: TabName; icon: IconName }> = [
  { label: 'Início', screen: 'Home', icon: 'home-outline' },
  { label: 'Desempenho', screen: 'Desempenho', icon: 'stats-chart-outline' },
  { label: 'Simulados', screen: 'Simulados', icon: 'clipboard-outline' },
  { label: 'Financeiro', screen: 'Financeiro', icon: 'wallet-outline' },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getActiveTabName(state: ReturnType<Nav['getState']>): TabName | null {
  const stackRoute = state.routes[state.index];
  if (stackRoute?.name !== 'AlunoTabs') return null;

  const tabState = stackRoute.state as { index?: number; routes?: Array<{ name: string }> } | undefined;
  const tabRoute = tabState?.routes?.[tabState.index ?? 0];

  return (tabRoute?.name as TabName | undefined) ?? 'Home';
}

export function AlunoDrawer() {
  const { visible, close } = useAlunoDrawer();
  const { user, signOut, refreshUserProfile } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(DRAWER_WIDTH, width * 0.86);
  const activeTab = getActiveTabName(navigation.getState());
  const [shouldRender, setShouldRender] = useState(visible);
  const userEmail = user?.email ?? '';
  const shouldShowEmail = Boolean(userEmail && !userEmail.endsWith('@interno'));

  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      void refreshUserProfile();
    }
  }, [visible, refreshUserProfile]);

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

  const student = user?.student;

  function handleAlterarSenha() {
    close();
    navigation.navigate('AlterarSenha');
  }

  function handleNavigate(screen: TabName) {
    close();

    if (screen === 'Simulados') {
      navigation.navigate('AlunoTabs', {
        screen,
        params: { screen: 'SimuladosList' },
      });
      return;
    }

    navigation.navigate('AlunoTabs', { screen });
  }

  function handleSair() {
    close();
    Alert.alert('Sair', 'Deseja sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
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
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.drawerTitulo}>Menu</Text>
              <Text style={styles.drawerSubtitulo}>Acesso rápido</Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.fecharBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.surface} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.perfilCard}>
              <View style={styles.avatar}>
                {user?.photo_url ? (
                  <Image source={{ uri: user.photo_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{getInitials(user?.name ?? 'A')}</Text>
                )}
              </View>
              <View style={styles.perfilInfo}>
                <Text style={styles.perfilNome} numberOfLines={2}>{user?.name ?? 'Aluno'}</Text>
                <Text style={styles.perfilRole}>Estudante</Text>
                {student?.enrollment_number ? (
                  <View style={styles.matriculaBadge}>
                    <Text style={styles.matriculaLabel}>Matrícula</Text>
                    <Text style={styles.matriculaNumero}>{student.enrollment_number}</Text>
                  </View>
                ) : null}
                {shouldShowEmail ? <Text style={styles.perfilMeta}>{userEmail}</Text> : null}
              </View>
            </View>

            <View style={styles.secao}>
              <Text style={styles.secaoLabel}>Navegação</Text>
              <View style={styles.menuPrincipal}>
                {MENU_ITEMS.map((item) => {
                  const active = activeTab === item.screen;

                  return (
                    <TouchableOpacity
                      key={item.screen}
                      style={[styles.navItem, active && styles.navItemAtivo]}
                      onPress={() => handleNavigate(item.screen)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.navIcone, active && styles.navIconeAtivo]}>
                        <Ionicons name={item.icon} size={19} color={active ? colors.surface : colors.primary} />
                      </View>
                      <View style={styles.navTextoWrap}>
                        <Text style={[styles.navTitulo, active && styles.navTituloAtivo]}>{item.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={17} color={active ? colors.surface : colors.primary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.menu}>
            <Text style={styles.secaoLabel}>Conta</Text>
            <TouchableOpacity style={styles.menuItem} onPress={handleAlterarSenha} activeOpacity={0.75}>
              <Ionicons name="key-outline" size={19} color={colors.primary} />
              <Text style={styles.menuItemTexto}>Trocar senha</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, styles.menuItemSair]} onPress={handleSair} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={19} color={colors.debit} />
              <Text style={[styles.menuItemTexto, styles.menuItemSairTexto]}>Sair</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  drawerTitulo: { fontSize: 18, fontWeight: '800', color: colors.surface },
  drawerSubtitulo: { fontSize: 11, color: '#C7D2FE', marginTop: 2, fontWeight: '600' },
  fecharBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerScroll: { flex: 1 },
  drawerScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  secao: { gap: 8 },
  secaoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C7D2FE',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  perfilCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  perfilInfo: { flex: 1, minWidth: 0 },
  perfilNome: { fontSize: 15, fontWeight: '800', color: colors.surface, marginBottom: 1 },
  perfilRole: { fontSize: 11, fontWeight: '700', color: '#C7D2FE', marginBottom: 3 },
  perfilMeta: { fontSize: 11, color: '#E0E7FF', marginTop: 1 },
  matriculaBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  matriculaLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matriculaNumero: { fontSize: 11, color: colors.primary, fontWeight: '900' },
  menuPrincipal: { gap: 7 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  navItemAtivo: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  navIcone: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconeAtivo: { backgroundColor: 'rgba(255,255,255,0.14)' },
  navTextoWrap: { flex: 1, minWidth: 0 },
  navTitulo: { fontSize: 13, fontWeight: '800', color: colors.primary },
  navTituloAtivo: { color: colors.surface },
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  menuItemTexto: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  menuItemSair: { backgroundColor: colors.surface, borderColor: colors.surface },
  menuItemSairTexto: { color: colors.debit },
});
