export const defaultColors = {
  primary: '#4F46E5',
  drawer_header_title: '#FFFFFF',
  drawer_header_subtitle: '#C7D2FE',
  drawer_header_icon: '#FFFFFF',
  drawer_section_label: '#C7D2FE',
  menu_button_background: '#FFFFFF',
  menu_button_text: '#4F46E5',
  menu_button_icon: '#4F46E5',
  menu_button_icon_background: '#EEF2FF',
  menu_button_chevron: '#4F46E5',
  menu_button_active_background: 'rgba(255,255,255,0.14)',
  menu_button_active_text: '#FFFFFF',
  menu_button_active_icon: '#FFFFFF',
  menu_button_active_icon_background: 'rgba(255,255,255,0.18)',
  menu_button_active_chevron: '#FFFFFF',
  ink: '#1E1B4B',
  text: '#312E81',
  muted: '#64748B',
  soft: '#EEF2FF',
  border: '#DDE3F5',
  surface: '#FFFFFF',
  background: '#F6F7FB',
  tab_bar_inactive: '#C7D2FE',
  debit: '#EF4444',
  credit: '#10B981',
} as const;

export type ThemeColors = { [K in keyof typeof defaultColors]: string };

/** Paleta estática (login, admin, professor). No fluxo aluno, prefira `useThemeColors()`. */
export const colors: ThemeColors = { ...defaultColors };

export const theme = { colors: defaultColors };
