import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { colors } from '../../../theme';
import { platformShadow } from '../../../lib/shadow';
import {
  type StudentNotificationItem,
} from '../../../services/notifications.service';
import {
  useNotificationActions,
  useNotificationsList,
} from '../hooks';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function NotificationsListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AlunoStackParamList>>();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, isRefetching, refetch } =
    useNotificationsList(page, unreadOnly);
  const { markAllRead } = useNotificationActions();

  const items = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;
  const pagination = data?.pagination;
  const totalCount = pagination?.total ?? items.length;

  const openItem = (item: StudentNotificationItem) => {
    navigation.navigate('NotificacaoDetalhe', { notificationId: item.id });
  };

  const renderItem = ({ item }: { item: StudentNotificationItem }) => (
    <TouchableOpacity
      style={[styles.messageCard, !item.is_read && styles.messageCardUnread]}
      activeOpacity={0.85}
      onPress={() => openItem(item)}
    >
      <View style={styles.unreadColumn}>
        {!item.is_read ? <View style={styles.unreadDot} /> : null}
      </View>

      <View style={styles.messageBody}>
        <View style={styles.messageMetaRow}>
          <Text style={[styles.senderText, !item.is_read && styles.senderTextUnread]} numberOfLines={1}>
            Escola
          </Text>
          <Text style={styles.messageDate}>{formatDate(item.created_at)}</Text>
        </View>

        <Text
          style={[styles.messageTitle, !item.is_read && styles.messageTitleUnread]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <Text style={styles.messageMetaText} numberOfLines={1}>
          {item.type_label} {item.is_read ? '• Lida' : '• Nova mensagem'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.headerGlowPrimary} />
        <View style={styles.headerGlowSecondary} />
        <View style={styles.headerRow}>
          <MenuButton />
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Notificações</Text>
              <Text style={styles.headerSubtitle}>Caixa de entrada</Text>
            </View>
          </View>
          {unreadCount > 0 ? (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              activeOpacity={0.85}
            >
              {markAllRead.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="checkmark-done-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.markAllPlaceholder} />
          )}
        </View>

        <View style={styles.inboxSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalCount}</Text>
            <Text style={styles.summaryLabel}>mensagens</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, unreadCount > 0 && styles.summaryValueUnread]}>
              {unreadCount}
            </Text>
            <Text style={styles.summaryLabel}>não lidas</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.filters}>
              <TouchableOpacity
                style={[styles.filterChip, !unreadOnly && styles.filterChipActive]}
                onPress={() => {
                  setUnreadOnly(false);
                  setPage(1);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, !unreadOnly && styles.filterTextActive]}>
                  Todas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, unreadOnly && styles.filterChipActive]}
                onPress={() => {
                  setUnreadOnly(true);
                  setPage(1);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, unreadOnly && styles.filterTextActive]}>
                  Não lidas {unreadCount > 0 ? `(${unreadCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="file-tray-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {unreadOnly ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação ainda.'}
              </Text>
              <Text style={styles.emptyText}>
                {unreadOnly
                  ? 'Sua caixa de entrada não tem mensagens pendentes.'
                  : 'As próximas mensagens da escola aparecerão aqui.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            pagination && pagination.last_page > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  disabled={page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.primary} />
                  <Text style={styles.pageBtnText}>Anterior</Text>
                </TouchableOpacity>
                <Text style={styles.pageInfo}>
                  {pagination.current_page} / {pagination.last_page}
                </Text>
                <TouchableOpacity
                  disabled={page >= pagination.last_page}
                  onPress={() => setPage((p) => p + 1)}
                  style={[
                    styles.pageBtn,
                    page >= pagination.last_page && styles.pageBtnDisabled,
                  ]}
                >
                  <Text style={styles.pageBtnText}>Próxima</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const headerShadow = platformShadow({ color: '#7C3AED', opacity: 0.08, radius: 18, elevation: 3 });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  headerSubtitle: { fontSize: 12, color: colors.muted, fontWeight: '700', marginTop: 2 },
  markAllBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EEE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllPlaceholder: { width: 42, height: 42 },
  inboxSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEE8FF',
    padding: 12,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900', color: colors.ink },
  summaryValueUnread: { color: colors.debit },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: '800', marginTop: 2 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.surface },
  list: { padding: 16, paddingBottom: 28 },
  listEmpty: { flexGrow: 1 },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
    gap: 10,
  },
  messageCardUnread: {
    backgroundColor: colors.surface,
  },
  unreadColumn: { width: 12, alignItems: 'center', paddingTop: 7 },
  messageBody: { flex: 1, minWidth: 0 },
  messageMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  senderText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  senderTextUnread: { fontWeight: '900' },
  messageDate: { fontSize: 12, color: colors.muted, fontWeight: '700', textAlign: 'right' },
  messageTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, lineHeight: 23 },
  messageTitleUnread: { color: colors.primary },
  messageMetaText: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.debit,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, color: colors.ink, fontWeight: '900', textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  pageInfo: { fontSize: 13, color: colors.muted, fontWeight: '600' },
});
