import type { IconName } from '../../ui';
import { navigationRef } from '../navigationRef';

/** Logo do tenant desligada provisoriamente: menu e SideNav mostram só o nome. Volte para true para reativar. */
export const SHOW_TENANT_LOGO = false;

/** Itens de navegação do aluno (menu-gaveta no celular e SideNav no tablet/desktop). */
export type MenuId =
  | 'home' | 'calendario' | 'desempenho' | 'questoes' | 'simulados' | 'provas-anteriores' | 'exercicios' | 'materiais' | 'financeiro';

type TabName = 'Home' | 'Desempenho' | 'Questoes' | 'Simulados' | 'Financeiro';

export type MenuItem =
  | { id: MenuId; label: string; icon: IconName; tab: TabName; nestedScreen?: 'ProvasAnteriores' | 'Exercicios' | 'Materiais' | 'SimuladosList' }
  | { id: MenuId; label: string; icon: IconName; stack: 'Calendario' };

export const MENU_ITEMS: MenuItem[] = [
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
const PROVAS_ANTERIORES_SCREENS = new Set(['ProvasAnteriores', 'ProvaAnteriorDetalhe']);
/** Telas de responder/corrigir: modo foco (sidebar recolhe para rail). */
export const FOCUS_SCREENS = new Set(['SimuladoExam', 'SimuladoResult', 'BancoPraticar', 'BancoSimulado']);

type Snapshot = { index?: number; routes?: Array<{ name?: string; state?: unknown }> } | undefined;
type NestedState = { index?: number; routes?: Array<{ name?: string; params?: { listScreen?: string }; state?: NestedState }> };

function activeTab(state: Snapshot) {
  const routes = state?.routes;
  if (!routes?.length) return null;
  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name !== 'AlunoTabs') return null;
  const tabState = stackRoute.state as NestedState | undefined;
  const tabRoutes = tabState?.routes;
  if (!tabRoutes?.length) return { name: 'Home' as TabName, state: undefined as NestedState | undefined };
  const tabRoute = tabRoutes[tabState?.index ?? 0] ?? tabRoutes[0];
  const name = TAB_NAMES.includes(tabRoute?.name as TabName) ? (tabRoute.name as TabName) : 'Home';
  return { name, state: tabRoute.state };
}

/** Nome da tela visível dentro da aba atual (ex.: 'SimuladoExam'). */
export function activeInnerScreen(state: Snapshot): string | null {
  const tab = activeTab(state);
  const inner = tab?.state?.routes?.[tab.state.index ?? 0];
  return inner?.name ?? null;
}

export function isFocusScreen(state: Snapshot): boolean {
  const name = activeInnerScreen(state);
  return !!name && FOCUS_SCREENS.has(name);
}

export function getActiveMenuId(state: Snapshot): MenuId | null {
  const routes = state?.routes;
  if (!routes?.length) return 'home';
  const stackRoute = routes[state?.index ?? 0] ?? routes[0];
  if (stackRoute?.name === 'Calendario') return 'calendario';
  const tab = activeTab(state);
  if (!tab) return null;
  if (tab.name === 'Simulados') {
    const simRoute = tab.state?.routes?.[tab.state?.index ?? 0];
    const name = simRoute?.name ?? 'SimuladosList';
    const listScreen = simRoute?.params?.listScreen;
    if (name === 'Exercicios' || (name === 'ProvaAnteriorDetalhe' && listScreen === 'Exercicios')) return 'exercicios';
    if (name === 'Materiais' || (name === 'ProvaAnteriorDetalhe' && listScreen === 'Materiais')) return 'materiais';
    if (PROVAS_ANTERIORES_SCREENS.has(name)) return 'provas-anteriores';
    return 'simulados';
  }
  return ({ Home: 'home', Desempenho: 'desempenho', Questoes: 'questoes', Financeiro: 'financeiro' } as Record<string, MenuId>)[tab.name] ?? null;
}

/** Navegação raiz sem a inferência profunda de tipos do React Navigation (estoura o compilador aqui). */
const rootNav = navigationRef as unknown as { isReady: () => boolean; navigate: (name: string, params?: object) => void };

export function navigateToMenuItem(item: MenuItem) {
  if (!rootNav.isReady()) return;
  if ('stack' in item) {
    rootNav.navigate(item.stack);
    return;
  }
  if (item.tab === 'Simulados') {
    rootNav.navigate('AlunoTabs', { screen: 'Simulados', params: { screen: item.nestedScreen ?? 'SimuladosList' } });
    return;
  }
  if (item.tab === 'Questoes') {
    rootNav.navigate('AlunoTabs', { screen: 'Questoes', params: { screen: 'BancoQuestoes' } });
    return;
  }
  rootNav.navigate('AlunoTabs', { screen: item.tab });
}

export function userInitials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'U') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
