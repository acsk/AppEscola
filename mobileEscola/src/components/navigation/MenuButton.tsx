import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlunoDrawer } from '../../context/AlunoDrawerContext';
import { colors } from '../../theme';

interface MenuButtonProps {
  color?: string;
  size?: number;
  style?: ViewStyle;
}

export function MenuButton({ color = colors.ink, size = 24, style }: MenuButtonProps) {
  const { open } = useAlunoDrawer();

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={open}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Abrir menu"
    >
      <Ionicons name="menu" size={size} color={color} />
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
