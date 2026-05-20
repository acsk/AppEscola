import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

export const CALENDAR_LEGEND_ORDER = [
  'exam',
  'exam_presential',
  'billing',
  'class',
  'school',
  'task',
  'general',
] as const;

export type CalendarLegendItem = {
  key: string;
  label: string;
  color: string;
};

type Props = {
  items: CalendarLegendItem[];
};

export function CalendarColorLegend({ items }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createCalendarLegendStyles(colors), [colors]);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Legenda</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.key} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createCalendarLegendStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    rowGap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '48%',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    flexShrink: 1,
  },
  });
}
