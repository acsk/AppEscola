import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PastExamListItem } from '../../../services/past-exams.service';
import { formatDataProva } from '../../../services/past-exams.service';
import { platformShadow } from '../../../lib/shadow';
import { PastMaterialPdfIcon } from './PastMaterialPdfIcon';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type PastMaterialCardProps = {
  item: PastExamListItem;
  dateLabel: string;
  onPress: () => void;
};

function pdfLabel(item: PastExamListItem): string {
  if (item.type === 'link') return 'LINK';
  if (item.file_type === 'pdf' || !item.file_type) return 'PDF';
  if (item.file_type === 'image') return 'IMG';
  return 'ARQ';
}

export function PastMaterialCard({ item, dateLabel, onPress }: PastMaterialCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dataProva = formatDataProva(item.exam_date, item.exam_year);
  const cursoLabel =
    item.courses?.length
      ? item.courses.map((c) => c.name).join(', ')
      : item.course?.name ?? null;
  const metaLine = [dataProva ? `${dateLabel} ${dataProva}` : null, item.exam_type_label, cursoLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      style={[styles.card, platformShadow({ color: colors.primary, opacity: 0.08, radius: 10, elevation: 2 })]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${item.title}`}
    >
      <View style={[styles.accent, { backgroundColor: colors.primary }]} />

      <PastMaterialPdfIcon
        variant="list"
        fileLabel={pdfLabel(item)}
        isLink={item.type === 'link'}
      />

      <View style={styles.body}>
        {item.subject ? (
          <Text style={styles.disciplina} numberOfLines={1}>
            {item.subject.name.toUpperCase()}
          </Text>
        ) : null}
        <Text style={styles.titulo} numberOfLines={2}>
          {item.title}
        </Text>
        {metaLine ? (
          <Text style={styles.meta} numberOfLines={2}>
            {metaLine}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={22} color={colors.primary} style={styles.chevron} />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingRight: 12,
      paddingLeft: 16,
      marginBottom: 10,
      gap: 12,
      overflow: 'hidden',
    },
    accent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    body: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 3,
    },
    disciplina: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.5,
    },
    titulo: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 21,
    },
    meta: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 15,
    },
    chevron: {
      flexShrink: 0,
      opacity: 0.85,
    },
  });
}
