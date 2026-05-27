import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { PastExamListItem } from '../../../services/past-exams.service';
import { formatDataProva } from '../../../services/past-exams.service';
import { platformShadow } from '../../../lib/shadow';
import { PastMaterialPdfIcon } from './PastMaterialPdfIcon';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type PastMaterialHomeCardProps = {
  item: PastExamListItem;
  onPress: () => void;
  width?: number;
};

function pdfLabel(item: PastExamListItem): string {
  if (item.type === 'link') return 'LINK';
  if (item.file_type === 'pdf' || !item.file_type) return 'PDF';
  if (item.file_type === 'image') return 'IMG';
  return 'ARQ';
}

export function PastMaterialHomeCard({
  item,
  onPress,
  width = 158,
}: PastMaterialHomeCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dataProva = formatDataProva(item.exam_date, item.exam_year);
  const metaParts = [dataProva, item.exam_type_label].filter(Boolean);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { width },
        platformShadow({ color: colors.primary, opacity: 0.08, radius: 10, elevation: 2 }),
      ]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${item.title}`}
    >
      <View style={[styles.accent, { backgroundColor: colors.primary }]} />

      <View style={styles.iconWrap}>
        <PastMaterialPdfIcon
          variant="home"
          fileLabel={pdfLabel(item)}
          isLink={item.type === 'link'}
        />
      </View>

      {item.subject ? (
        <Text style={styles.disciplina} numberOfLines={1}>
          {item.subject.name.toUpperCase()}
        </Text>
      ) : null}

      <Text style={styles.titulo} numberOfLines={2}>
        {item.title}
      </Text>

      {metaParts.length > 0 ? (
        <Text style={styles.meta} numberOfLines={2}>
          {metaParts.join(' · ')}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingTop: 12,
      paddingBottom: 12,
      paddingHorizontal: 12,
      paddingLeft: 14,
      marginRight: 10,
      overflow: 'hidden',
      alignItems: 'center',
    },
    accent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    iconWrap: {
      marginBottom: 8,
    },
    disciplina: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.4,
      alignSelf: 'stretch',
      textAlign: 'center',
      marginBottom: 4,
    },
    titulo: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 18,
      textAlign: 'center',
      alignSelf: 'stretch',
      marginBottom: 4,
    },
    meta: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 14,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
  });
}
