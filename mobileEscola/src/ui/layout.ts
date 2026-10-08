import { useWindowDimensions } from 'react-native';
import { layout } from './tokens';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

/**
 * Casca responsiva do protótipo: < 768 tab bar + menu-gaveta; 768–1023 rail (72px);
 * ≥ 1024 sidebar (248px) e telas em colunas; ≥ 1360 banco de questões em 3 colunas.
 */
export function useLayoutMode() {
  const { width } = useWindowDimensions();
  const mode: LayoutMode = width >= layout.desktop ? 'desktop' : width >= layout.tablet ? 'tablet' : 'mobile';
  return { width, mode, isMobile: mode === 'mobile', isDesktop: mode === 'desktop', isWide: width >= layout.wide };
}
