import React from 'react';
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Txt, type IconName } from './primitives';
import { usePalette } from './theme';
import { radius, shadow, size, space, type } from './tokens';

// ── AppBar ───────────────────────────────────────────────────────────────────

/** Barra do topo sobre `bg`. `large`: título grande abaixo (telas-raiz). */
export function AppBar({
  title, subtitle, leading, trailing, large,
}: { title?: string; subtitle?: string; leading?: React.ReactNode; trailing?: React.ReactNode; large?: boolean }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: p.bg, paddingTop: insets.top + space[2], paddingHorizontal: space[2], paddingBottom: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 48 }}>
        {leading}
        {!large ? (
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: space[2] }}>
            {title ? <Text numberOfLines={1} accessibilityRole="header" style={[type.title, { fontSize: 17, lineHeight: 22, color: p.ink }]}>{title}</Text> : null}
            {subtitle ? <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{subtitle}</Txt> : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {trailing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>{trailing}</View> : null}
      </View>
      {large && title ? (
        <View style={{ paddingHorizontal: space[2], paddingTop: space[2], paddingBottom: space[1] }}>
          <Txt variant="titleLg" accessibilityRole="header">{title}</Txt>
          {subtitle ? <Txt variant="bodySm" tone="subtle">{subtitle}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}

// ── TabBar ───────────────────────────────────────────────────────────────────

export type TabItem = { key: string; icon: IconName; label: string };

/** Tab bar branca; a cor só marca a aba ativa (pílula brand-soft). */
export function TabBar({ items, activeKey, onPress }: { items: TabItem[]; activeKey: string; onPress: (key: string) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{
      flexDirection: 'row', height: size.tabbarH + insets.bottom, paddingBottom: insets.bottom,
      backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line,
    }}>
      {items.map((item) => {
        const on = item.key === activeKey;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={item.label}
            onPress={() => onPress(item.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <View style={{ width: 52, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.brandSoft : 'transparent' }}>
              <Icon name={item.icon} size={22} strokeWidth={on ? 2.25 : 2} color={on ? p.brandInk : p.inkSubtle} />
            </View>
            <Text numberOfLines={1} style={[type.caption, { color: on ? p.ink : p.inkSubtle }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── ListItem ─────────────────────────────────────────────────────────────────

export function ListItem({
  icon, title, subtitle, trailing, chevron = true, tone, active, onPress,
}: { icon?: IconName; title: string; subtitle?: string; trailing?: React.ReactNode; chevron?: boolean; tone?: 'danger'; active?: boolean; onPress?: () => void }) {
  const p = usePalette();
  const danger = tone === 'danger';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: 6, paddingHorizontal: space[3],
        borderRadius: radius.md, backgroundColor: active || pressed ? p.surfaceSunken : 'transparent',
      })}>
      {icon ? (
        <View style={{
          width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
          backgroundColor: danger ? p.dangerSoft : active ? p.brand : p.surfaceSunken,
        }}>
          <Icon name={icon} size={20} color={danger ? p.dangerInk : active ? p.onBrand : p.inkMuted} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.label, { fontSize: 15, color: danger ? p.dangerInk : p.ink }]}>{title}</Text>
        {subtitle ? <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {trailing}
      {chevron && !danger ? <Icon name="chevron-right" size={18} color={p.inkSubtle} /> : null}
    </Pressable>
  );
}

// ── BottomBar (rodapé fixo de ação) ──────────────────────────────────────────

export function BottomBar({ hint, children }: { hint?: string; children: React.ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line,
      paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: space[4] + insets.bottom,
    }}>
      {hint ? <Txt variant="bodySm" tone="subtle" style={{ textAlign: 'center', marginBottom: space[2] }}>{hint}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>{children}</View>
    </View>
  );
}

// ── Sheet (bottom sheet) ─────────────────────────────────────────────────────

export function Sheet({
  visible, title, onClose, footer, children, maxHeight = '88%',
}: { visible: boolean; title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; maxHeight?: ViewStyle['maxHeight'] }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: p.scrim }} />
        <View accessibilityViewIsModal style={[{
          backgroundColor: p.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight,
        }, shadow.sheet]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: p.lineStrong, alignSelf: 'center', marginTop: space[2] }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[2], paddingLeft: space[5], paddingRight: space[2] }}>
            <Txt variant="title" accessibilityRole="header">{title}</Txt>
            <IconButton icon="x" label="Fechar" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: space[3], paddingHorizontal: space[5], paddingBottom: footer ? space[5] : space[5] + insets.bottom }}>
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ flexDirection: 'row', gap: space[3], paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: space[4] + insets.bottom, borderTopWidth: 1, borderTopColor: p.line }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Corpo de tela com margem lateral de 16 e respiro entre seções de 24. */
export function ScreenBody({ children, style, gap = space[6] }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ gap, paddingHorizontal: space[4], paddingBottom: space[6] }, style]}>{children}</View>;
}
