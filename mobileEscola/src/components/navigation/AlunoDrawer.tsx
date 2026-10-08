import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlunoDrawer } from '../../context/AlunoDrawerContext';
import { useAuth } from '../../context/AuthContext';
import { SHOW_TENANT_LOGO, MENU_ITEMS, getActiveMenuId, navigateToMenuItem, userInitials, type MenuItem } from '../../navigation/aluno/menu';
import { navigationRef } from '../../navigation/navigationRef';
import { useRootNavigationState } from '../../navigation/useRootNavigationState';
import { useTenantTheme } from '../../context/TenantThemeContext';
import ConfirmModal from '../ConfirmModal';
import { font, IconButton, ListItem, NewPill, Overline, Txt, newLabel, radius, shadow, space, type, usePalette } from '../../ui';
import { useNewQuestionsCount } from '../../features/banco-questoes/hooks';

const DRAWER_WIDTH = 312;

/** Menu lateral (protótipo "TelaMenu"): itens soltos, cor só no ativo. */
export function AlunoDrawer() {
  const p = usePalette();
  const { logoUrl, tenantName } = useTenantTheme();
  const newQuestions = useNewQuestionsCount();
  const { visible, close } = useAlunoDrawer();
  const { signOut, user } = useAuth();
  const rootNavState = useRootNavigationState();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(DRAWER_WIDTH, width * 0.86);
  const activeMenuId = getActiveMenuId(rootNavState as never);
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
    navigateToMenuItem(item);
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
              width: drawerWidth, height: '100%', backgroundColor: p.navBg,
              paddingTop: insets.top + space[2], paddingBottom: Math.max(insets.bottom, space[6]), paddingHorizontal: space[2],
              transform: [{ translateX }],
            }, shadow.sheet]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space[2], paddingLeft: space[3], paddingRight: space[1] }}>
              {SHOW_TENANT_LOGO && logoUrl ? (
                <Image source={{ uri: logoUrl }} resizeMode="contain" accessibilityLabel={tenantName ? `Logo ${tenantName}` : 'Logo da escola'}
                  style={{ height: 32, width: 160 }} />
              ) : (
                <Text numberOfLines={1} style={{ fontSize: 20, lineHeight: 24, ...font.extrabold, letterSpacing: -0.2, color: p.navInk, flexShrink: 1 }}>
                  {tenantName ?? 'App Escola'}
                </Text>
              )}
              <IconButton icon="x" label="Fechar menu" color={p.navInk} onPress={close} />
            </View>

            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', marginVertical: space[2], marginHorizontal: space[1], padding: space[3], borderRadius: radius.md, backgroundColor: p.navActive }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.navActive, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...font.extrabold, fontSize: 14, color: p.navInk }}>{userInitials(user?.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, color: p.navInk }}>{user?.name ?? 'Aluno'}</Txt>
                {enrollment ? <Txt variant="bodySm" numberOfLines={1} style={{ color: p.navInkMuted }}>Matrícula {enrollment}</Txt> : null}
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
              <Overline style={{ paddingTop: space[4], paddingBottom: 6, paddingHorizontal: space[3], color: p.navInkMuted }}>Navegação</Overline>
              {MENU_ITEMS.map((item) => (
                <ListItem key={item.id} icon={item.icon} title={item.label} chevron={false} active={item.id === activeMenuId} onPress={() => handleMenuPress(item)} onNav
                  trailing={item.id === 'questoes' && newQuestions ? <NewPill tone="nav" label={newLabel(newQuestions)} /> : undefined} />
              ))}
              <Overline style={{ paddingTop: space[4], paddingBottom: 6, paddingHorizontal: space[3], color: p.navInkMuted }}>Conta</Overline>
              <ListItem icon="key" title="Trocar senha" chevron={false} onNav onPress={handleAlterarSenha} />
              <ListItem icon="logout" title="Sair" tone="danger" onNav onPress={() => setConfirmLogoutVisible(true)} />
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
