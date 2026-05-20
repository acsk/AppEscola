import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../theme';
import { platformShadow } from '../../../lib/shadow';
import {
  fetchNotificationDetail,
  notificationIconName,
  type StudentNotificationItem,
} from '../../../services/notifications.service';
import { notificationKeys } from '../queryKeys';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';

type Route = RouteProp<AlunoStackParamList, 'NotificacaoDetalhe'>;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getNotificationTone(item: StudentNotificationItem) {
  if (item.type === 'billing_due') {
    return { color: colors.debit, bg: '#FEF2F2', border: '#FECACA' };
  }

  if (item.type === 'exam_pending' || item.type === 'exam_result') {
    return { color: '#F97316', bg: '#FFF7ED', border: '#FED7AA' };
  }

  if (item.type === 'class_announcement') {
    return { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' };
  }

  return { color: colors.primary, bg: colors.soft, border: '#C7D2FE' };
}

export function NotificationDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AlunoStackParamList>>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { notificationId } = route.params;
  const queryClient = useQueryClient();

  const { data: notification, isLoading, isError } = useQuery({
    queryKey: notificationKeys.detail(notificationId),
    queryFn: () => fetchNotificationDetail(notificationId),
  });

  useEffect(() => {
    if (notification) {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    }
  }, [notification?.id, queryClient]);

  const handleAction = () => {
    if (!notification?.data) return;
    const { action, exam_id, invoice_id } = notification.data;

    if ((action === 'open_exam' || notification.type === 'exam_pending') && exam_id) {
      navigation.navigate('AlunoTabs', {
        screen: 'Simulados',
        params: {
          screen: 'SimuladoDetalhe',
          params: { examId: exam_id },
        },
      });
      return;
    }

    if (
      (action === 'open_finance' || notification.type === 'billing_due') &&
      invoice_id
    ) {
      navigation.navigate('AlunoTabs', { screen: 'Financeiro' });
      return;
    }
  };

  const showAction =
    notification?.data?.exam_id ||
    notification?.data?.invoice_id ||
    notification?.data?.action === 'open_exam' ||
    notification?.data?.action === 'open_finance' ||
    notification?.type === 'exam_pending' ||
    notification?.type === 'billing_due';

  const actionLabel =
    notification?.type === 'billing_due' || notification?.data?.action === 'open_finance'
      ? 'Ver cobrança'
      : 'Abrir simulado';

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !notification) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Não foi possível carregar a notificação.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tone = getNotificationTone(notification);

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.headerGlowPrimary} />
        <View style={styles.headerGlowSecondary} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backIcon} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Mensagem</Text>
            <Text style={styles.headerSubtitle}>Caixa de entrada</Text>
          </View>
          <View style={[styles.headerTypeIcon, { backgroundColor: tone.bg }]}>
            <Ionicons
              name={notificationIconName(notification.type_icon) as any}
              size={22}
              color={tone.color}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.envelopeCard}>
          <View style={styles.messageMetaRow}>
            <View style={[styles.typePill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.typePillText, { color: tone.color }]} numberOfLines={1}>
                {notification.type_label}
              </Text>
            </View>
            <View style={styles.readPill}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.credit} />
              <Text style={styles.readPillText}>Lida</Text>
            </View>
          </View>

          <Text style={styles.title}>{notification.title}</Text>

          <View style={styles.dateRow}>
            <Ionicons name="time-outline" size={16} color={colors.muted} />
            <Text style={styles.date}>{formatDate(notification.created_at)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.bodyHeader}>
            <View style={[styles.bodyIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Ionicons
                name={notificationIconName(notification.type_icon) as any}
                size={28}
                color={tone.color}
              />
            </View>
            <View style={styles.bodyHeaderText}>
              <Text style={styles.bodyHeaderLabel}>Mensagem da escola</Text>
              <Text style={styles.bodyHeaderSub}>Leia os detalhes abaixo</Text>
            </View>
          </View>

          <Text style={styles.body}>{notification.body}</Text>
        </View>

        {showAction ? (
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={handleAction}>
            <Ionicons
              name={notification.type === 'billing_due' ? 'wallet-outline' : 'clipboard-outline'}
              size={20}
              color={colors.surface}
            />
            <Text style={styles.actionBtnText}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.surface} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const cardShadow = platformShadow({ color: '#000000', opacity: 0.06, radius: 12, elevation: 2 });
const headerShadow = platformShadow({ color: '#7C3AED', opacity: 0.08, radius: 18, elevation: 3 });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 16 },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  backBtnText: { color: colors.surface, fontWeight: '700' },
  headerWrap: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    ...(headerShadow as object),
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    right: -104,
    top: -150,
    backgroundColor: '#F0E9FF',
    opacity: 0.92,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -76,
    top: 58,
    backgroundColor: '#F7F2FF',
    opacity: 0.98,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    paddingBottom: 14,
  },
  backIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#EEE8FF',
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  headerSubtitle: { fontSize: 12, color: colors.muted, fontWeight: '700', marginTop: 2 },
  headerTypeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, paddingBottom: 32 },
  envelopeCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...(cardShadow as object),
  },
  messageMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typePill: {
    maxWidth: '70%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  typePillText: { fontSize: 12, fontWeight: '900' },
  readPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },
  readPillText: { fontSize: 11, color: colors.credit, fontWeight: '900' },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: colors.ink,
    lineHeight: 31,
    marginTop: 16,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  date: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#EEF2F7', marginVertical: 18 },
  bodyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  bodyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyHeaderText: { flex: 1, minWidth: 0 },
  bodyHeaderLabel: { fontSize: 15, color: colors.ink, fontWeight: '900' },
  bodyHeaderSub: { fontSize: 12, color: colors.muted, fontWeight: '700', marginTop: 2 },
  body: { fontSize: 18, color: colors.text, lineHeight: 29 },
  actionBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionBtnText: { fontSize: 15, fontWeight: '800', color: colors.surface },
});
