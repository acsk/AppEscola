import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { PastExamListItem } from '../../../services/past-exams.service';
import { formatDataProva } from '../../../services/past-exams.service';
import { platformShadow } from '../../../lib/shadow';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type PastMaterialCardProps = {
  item: PastExamListItem;
  dateLabel: string;
  onPress: () => void;
};

function fileVisual(item: PastExamListItem): { icon: IconName; label: string } {
  if (item.type === 'link') {
    return { icon: 'open-outline', label: 'Link' };
  }
  if (item.file_type === 'pdf' || !item.file_type) {
    return { icon: 'document-text', label: 'PDF' };
  }
  if (item.file_type === 'image') {
    return { icon: 'image', label: 'IMG' };
  }
  return { icon: 'document-attach-outline', label: 'Arq' };
}

export function PastMaterialCard({ item, dateLabel, onPress }: PastMaterialCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { icon, label } = fileVisual(item);
  const dataProva = formatDataProva(item.exam_date, item.exam_year);
  const cursoLabel =
    item.courses?.length
      ? item.courses.map((c) => c.name).join(', ')
      : item.course?.name ?? null;

  const metaParts = [item.exam_type_label, cursoLabel].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.card, platformShadow({ color: '#7C3AED', opacity: 0.05, radius: 8, elevation: 1 })]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Visualizar ${item.title}`}
    >
      <View style={[styles.accent, { backgroundColor: colors.primary }]} />

      <View style={styles.pdfWrap}>
        <Ionicons name={icon} size={40} color={colors.primary} />
        <Text style={styles.pdfLabel}>{label}</Text>
      </View>

      <View style={styles.body}>
        {item.subject ? (
          <Text style={styles.disciplina} numberOfLines={1}>
            {item.subject.name}
          </Text>
        ) : null}
        <Text style={styles.titulo} numberOfLines={2}>
          {item.title}
        </Text>
        {dataProva ? (
          <Text style={styles.meta} numberOfLines={1}>
            {dateLabel}: {dataProva}
          </Text>
        ) : null}
        {metaParts.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        ) : null}
      </View>

      <View style={styles.acao}>
        <Ionicons name="eye-outline" size={16} color={colors.primary} />
        <Text style={styles.acaoTexto}>Ver</Text>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingRight: 10,
      paddingLeft: 14,
      marginBottom: 10,
      gap: 10,
      overflow: 'hidden',
    },
    accent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    pdfWrap: {
      width: 58,
      height: 58,
      borderRadius: 12,
      backgroundColor: colors.soft,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    pdfLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 2,
      letterSpacing: 0.3,
    },
    body: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 2,
    },
    disciplina: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    titulo: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 20,
    },
    meta: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 15,
    },
    acao: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.soft,
      flexShrink: 0,
      gap: 2,
    },
    acaoTexto: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
    },
  });
}
