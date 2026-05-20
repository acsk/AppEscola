import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOptionalAlunoDrawer } from '../../context/AlunoDrawerContext';
import { useThemeColors } from '../../context/TenantThemeContext';

interface MenuButtonProps {
  color?: string;
  size?: number;
  style?: ViewStyle;
}

export function MenuButton({ color, size = 24, style }: MenuButtonProps) {
  const colors = useThemeColors();
  const drawer = useOptionalAlunoDrawer();
  const iconColor = color ?? colors.ink;

  if (!drawer) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={drawer.open}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Abrir menu"
    >
      <Ionicons name="menu" size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
});
