import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type SizeVariant = 'list' | 'detail';

type PastMaterialPdfIconProps = {
  variant?: SizeVariant;
  fileLabel?: string;
  isLink?: boolean;
};

const SIZES = {
  list: { box: 76, icon: 46, labelSize: 11 },
  detail: { box: 112, icon: 56, labelSize: 12 },
} as const;

export function PastMaterialPdfIcon({
  variant = 'list',
  fileLabel = 'PDF',
  isLink = false,
}: PastMaterialPdfIconProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dims = SIZES[variant];
  const iconName: IconName = isLink ? 'open-outline' : 'document-text';
  const label = isLink ? 'LINK' : fileLabel;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: dims.box,
          height: dims.box,
          borderRadius: variant === 'detail' ? 16 : 14,
        },
      ]}
    >
      <View style={styles.ring} />
      <Ionicons name={iconName} size={dims.icon} color={colors.primary} />
      <View style={styles.badge}>
        <Text style={[styles.badgeText, { fontSize: dims.labelSize }]}>{label}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.soft,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      overflow: 'hidden',
    },
    ring: {
      position: 'absolute',
      width: '88%',
      height: '88%',
      borderRadius: 999,
      backgroundColor: colors.surface,
      opacity: 0.65,
    },
    badge: {
      position: 'absolute',
      bottom: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    badgeText: {
      fontWeight: '800',
      color: colors.surface,
      letterSpacing: 0.5,
    },
  });
}
