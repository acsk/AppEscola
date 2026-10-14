import { useEffect } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

const STYLE_ID = 'question-lock-style';

/**
 * Trava o enunciado, as alternativas e a imagem da questão.
 * No navegador, impede seleção, cópia, recorte, colagem, arrastar e o menu de contexto.
 * No app nativo, o texto fica com selectable={false} em RichText.
 */
function installWebLock(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '[data-question-lock], [data-question-lock] * {',
      '  -webkit-user-select: none !important;',
      '  user-select: none !important;',
      '  -webkit-touch-callout: none !important;',
      '}',
      '[data-question-lock] img { -webkit-user-drag: none; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  const lockedElement = (node: EventTarget | Node | null | undefined): boolean => {
    const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    return !!el?.closest('[data-question-lock]');
  };
  const block = (event: Event) => {
    const selection = document.getSelection();
    const fromSelection = selection && !selection.isCollapsed
      && (lockedElement(selection.anchorNode) || lockedElement(selection.focusNode));
    if (!lockedElement(event.target) && !fromSelection) return;
    event.preventDefault();
  };
  const types = ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'selectstart'] as const;
  for (const type of types) document.addEventListener(type, block, true);
  return () => {
    for (const type of types) document.removeEventListener(type, block, true);
  };
}

let users = 0;
let uninstall: (() => void) | null = null;

export function QuestionShield({ style, ...rest }: ViewProps) {
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    users += 1;
    if (users === 1) uninstall = installWebLock();
    return () => {
      users -= 1;
      if (users === 0) {
        uninstall?.();
        uninstall = null;
      }
    };
  }, []);

  return (
    <View
      {...rest}
      {...(Platform.OS === 'web' ? { dataSet: { questionLock: 'true' } } : {})}
      style={style}
    />
  );
}
