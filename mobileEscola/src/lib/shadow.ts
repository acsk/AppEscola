import { Platform, ViewStyle } from 'react-native';

interface ShadowOptions {
  color: string;
  opacity?: number;
  radius?: number;
  elevation?: number;
  offsetY?: number;
}

function hexToRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '0, 0, 0';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/** Sombra compatível com web (`boxShadow`) e nativo (`shadow*` + `elevation`). */
export function platformShadow({
  color,
  opacity = 0.08,
  radius = 12,
  elevation = 2,
  offsetY = 4,
}: ShadowOptions): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `0 ${offsetY}px ${radius}px rgba(${hexToRgb(color)}, ${opacity})`,
    };
  }

  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: Math.max(1, Math.round(offsetY / 2)) },
    elevation,
  };
}
