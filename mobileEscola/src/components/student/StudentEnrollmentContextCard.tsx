import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  enrollmentHeadline,
  primaryActiveEnrollment,
  type StudentActiveEnrollment,
} from '../../types/student-enrollment';
import { useThemeColors } from '../../context/TenantThemeContext';
import type { ThemeColors } from '../../theme';
import { platformShadow } from '../../lib/shadow';

type Props = {
  enrollments: StudentActiveEnrollment[] | undefined;
  compact?: boolean;
};

export function StudentEnrollmentContextCard({ enrollments, compact = false }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const enrollment = primaryActiveEnrollment(enrollments);

  if (!enrollment) {
    return null;
  }

  const isBundle = enrollment.enrollment_type === 'bundle' && enrollment.bundle;
  const classes = isBundle
    ? enrollment.school_classes.length > 0
      ? enrollment.school_classes
      : enrollment.school_class
        ? [{ id: enrollment.school_class.id, name: enrollment.school_class.name, course: enrollment.course }]
        : []
    : [];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, isBundle ? styles.badgeBundle : styles.badgePlan]}>
          <Ionicons
            name={isBundle ? 'layers-outline' : 'school-outline'}
            size={14}
            color={isBundle ? '#6D28D9' : '#0369A1'}
          />
          <Text style={[styles.badgeText, isBundle ? styles.badgeTextBundle : styles.badgeTextPlan]}>
            {isBundle ? 'Pacote' : 'Plano'}
          </Text>
        </View>
        {enrollment.enrollment_number ? (
          <Text style={styles.contractNumber}>{enrollment.enrollment_number}</Text>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {enrollmentHeadline(enrollment)}
      </Text>

      {isBundle && enrollment.bundle?.cycle_label ? (
        <Text style={styles.subtitle}>Cobrança {enrollment.bundle.cycle_label.toLowerCase()}</Text>
      ) : enrollment.course_plan ? (
        <Text style={styles.subtitle}>Plano {enrollment.course_plan.name}</Text>
      ) : null}

      {isBundle && classes.length > 0 ? (
        <View style={styles.classesBlock}>
          <Text style={styles.classesLabel}>Turmas incluídas</Text>
          {classes.map((schoolClass) => (
            <View key={schoolClass.id} style={styles.classRow}>
              <Ionicons name="ellipse" size={6} color={colors.primary} style={styles.classBullet} />
              <Text style={styles.classText} numberOfLines={2}>
                {schoolClass.course?.name ? `${schoolClass.course.name} · ` : ''}
                {schoolClass.name}
              </Text>
            </View>
          ))}
        </View>
      ) : enrollment.school_class ? (
        <Text style={styles.singleClass} numberOfLines={2}>
          Turma {enrollment.school_class.name}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: compact ? 12 : 14,
      borderWidth: 1,
      borderColor: '#E8E4F8',
      marginBottom: compact ? 10 : 14,
      ...platformShadow({ color: '#6D4DE6', opacity: 0.05, radius: 10, elevation: 1 }),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeBundle: {
      backgroundColor: '#F3E8FF',
    },
    badgePlan: {
      backgroundColor: '#E0F2FE',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    badgeTextBundle: {
      color: '#6D28D9',
    },
    badgeTextPlan: {
      color: '#0369A1',
    },
    contractNumber: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: '600',
    },
    title: {
      fontSize: compact ? 15 : 16,
      fontWeight: '700',
      color: colors.ink,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 12,
      color: colors.muted,
    },
    singleClass: {
      marginTop: 8,
      fontSize: 13,
      color: colors.text,
    },
    classesBlock: {
      marginTop: 10,
      gap: 6,
    },
    classesLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    classRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    classBullet: {
      marginTop: 6,
    },
    classText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
  });
}
