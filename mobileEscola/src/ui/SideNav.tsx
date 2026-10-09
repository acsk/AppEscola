import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Icon, type IconName } from './primitives';
import { NewPill } from './content';
import { usePalette } from './theme';
import { font, layout, radius, space, type } from './tokens';

export type SideNavItem = {
  key: string; icon: IconName; label: string; count?: number;
  /** Pílula azul. Sem `badgeText`, o texto é "N novas". */
  badge?: number;
  badgeText?: string;
};

/**
 * Navegação lateral do tablet/desktop (protótipo "SideNav"): completa (248px) ou rail (72px, só ícones).
 * Cor só no ícone do item ativo; o fundo do ativo é neutro.
 */
export function SideNav({
  items, activeKey, onSelect, collapsed, brand, logoUrl, user,
}: {
  items: SideNavItem[]; activeKey: string | null; onSelect: (key: string) => void; collapsed?: boolean;
  brand: string; logoUrl?: string | null; user?: { initials: string; name: string; meta?: string | null; photoUrl?: string | null };
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="menu" accessibilityLabel="Navegação principal" style={{
      width: collapsed ? layout.railW : layout.sidebarW, height: '100%', backgroundColor: p.navBg,
      paddingVertical: space[4], paddingHorizontal: collapsed ? space[2] : space[3], gap: space[1],
    }}>
      {collapsed ? (
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: p.navInk, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: space[4] }}>
          <Text style={{ ...font.extrabold, fontSize: 18, color: p.navBg }}>{brand.charAt(0).toUpperCase()}</Text>
        </View>
      ) : logoUrl ? (
        <Image source={{ uri: logoUrl }} resizeMode="contain" accessibilityLabel={`Logo ${brand}`} style={{ height: 32, width: 180, marginHorizontal: space[3], marginTop: space[2], marginBottom: space[5] }} />
      ) : (
        <Text numberOfLines={1} style={{ fontSize: 19, lineHeight: 24, ...font.extrabold, letterSpacing: -0.2, color: p.navInk, paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: space[5] }}>{brand}</Text>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const on = item.key === activeKey;
          const pill = item.badge ? (item.badgeText ?? `${item.badge} ${item.badge === 1 ? 'nova' : 'novas'}`) : null;
          return (
            <Pressable key={item.key} accessibilityRole="menuitem" accessibilityLabel={pill ? `${item.label}, ${pill}` : item.label} accessibilityState={{ selected: on }}
              onPress={() => onSelect(item.key)}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                flexDirection: 'row', alignItems: 'center', gap: space[3], height: collapsed ? 44 : 40, borderRadius: radius.sm,
                paddingHorizontal: collapsed ? 0 : space[3], justifyContent: collapsed ? 'center' : 'flex-start',
                backgroundColor: on || hovered || pressed ? p.navActive : 'transparent',
              }) as never}>
              <View>
                <Icon name={item.icon} size={20} color={on ? p.navAccent : p.navInkMuted} />
                {collapsed && item.badge ? <View style={{ position: 'absolute', top: -2, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: p.navNew, borderWidth: 1.5, borderColor: p.navBg }} /> : null}
              </View>
              {!collapsed ? <Text numberOfLines={1} style={[type.label, { color: on ? p.navInk : p.navInkMuted, flex: 1 }]}>{item.label}</Text> : null}
              {!collapsed && pill ? <NewPill tone="nav" label={pill} /> : null}
              {!collapsed && !item.badge && item.count != null ? <Text style={[type.caption, { ...font.bold, color: p.navInkMuted }]}>{item.count}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {user ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3], paddingHorizontal: collapsed ? 0 : space[2], justifyContent: collapsed ? 'center' : 'flex-start', borderTopWidth: 1, borderTopColor: p.navLine }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.navActive, borderWidth: 1, borderColor: p.navLine, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {user.photoUrl ? <Image source={{ uri: user.photoUrl }} style={{ width: 36, height: 36 }} />
              : <Text style={{ ...font.extrabold, fontSize: 13, color: p.navInk }}>{user.initials}</Text>}
          </View>
          {!collapsed ? (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[type.label, { color: p.navInk, lineHeight: 18 }]}>{user.name}</Text>
              {user.meta ? <Text numberOfLines={1} style={[type.caption, { ...font.medium, color: p.navInkMuted }]}>{user.meta}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
