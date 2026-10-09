import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTenantTheme } from '../../context/TenantThemeContext';
import { useRootNavigationState } from '../useRootNavigationState';
import { SHOW_TENANT_LOGO, MENU_ITEMS, getActiveMenuId, isFocusScreen, navigateToMenuItem, userInitials } from './menu';
import { SideNav, useLayoutMode, usePalette } from '../../ui';
import { useNewQuestionsCount } from '../../features/banco-questoes/hooks';
import { usePendingSimuladosCount } from '../../features/simulados/hooks';

/**
 * Casca responsiva do aluno: no celular só o conteúdo (tab bar + menu-gaveta);
 * no tablet/desktop a SideNav fica à esquerda — rail no tablet e no modo foco (respondendo).
 */
export function AlunoShell({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  const { mode } = useLayoutMode();
  const { user } = useAuth();
  const { tenantName, logoUrl } = useTenantTheme();
  const state = useRootNavigationState() as never;
  const newQuestions = useNewQuestionsCount(mode !== 'mobile');
  const pendingSimulados = usePendingSimuladosCount(mode !== 'mobile');
  if (mode === 'mobile') return <>{children}</>;
  const collapsed = mode === 'tablet' || isFocusScreen(state);
  const enrollment = user?.student?.enrollment_number;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: p.bg }}>
      <SideNav
        collapsed={collapsed}
        brand={tenantName ?? 'App Escola'}
        logoUrl={SHOW_TENANT_LOGO ? logoUrl : null}
        items={MENU_ITEMS.map((m) => ({
          key: m.id, icon: m.icon, label: m.label,
          badge: m.id === 'questoes' ? newQuestions : m.id === 'simulados' ? pendingSimulados : undefined,
          badgeText: m.id === 'simulados' && pendingSimulados
            ? `${pendingSimulados} ${pendingSimulados === 1 ? 'pendente' : 'pendentes'}`
            : undefined,
        }))}
        activeKey={getActiveMenuId(state)}
        onSelect={(key) => {
          const item = MENU_ITEMS.find((m) => m.id === key);
          if (item) navigateToMenuItem(item);
        }}
        user={{
          initials: userInitials(user?.name), name: user?.name ?? 'Aluno', meta: enrollment ? `Matrícula ${enrollment}` : null,
          photoUrl: (user as { photo_url?: string | null } | null)?.photo_url ?? null,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}
