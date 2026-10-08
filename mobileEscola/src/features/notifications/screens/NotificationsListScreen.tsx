import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentNotificationItem, StudentNotificationType } from '../../../services/notifications.service';
import { useNotificationActions, useNotificationsList } from '../hooks';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';
import {
  AppBar, Button, Card, EmptyState, IconButton, LinkButton, NotificationItem, PageBody, PageHeader, ScreenBody, SegmentedControl, Txt,
  font, space, useLayoutMode, usePalette, type IconName,
} from '../../../ui';

type Nav = NativeStackNavigationProp<AlunoStackParamList>;

const ICON: Record<StudentNotificationType, IconName> = {
  general: 'bell', class_announcement: 'users', billing_due: 'receipt', exam_pending: 'clipboard', exam_result: 'chart',
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86400000;

/** Grupo por dia: Hoje, Ontem, Esta semana, Anteriores. */
function groupOf(iso: string): string {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
  if (diff <= 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return 'Esta semana';
  return 'Anteriores';
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff <= 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase());
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Notificações (protótipos "TelaNotificacoes" e "DesktopNotificacoes"): Todas / Não lidas, por dia, com ação direta. */
export function NotificationsListScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const { isDesktop } = useLayoutMode();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, isRefetching, refetch } = useNotificationsList(page, unreadOnly);
  const { markRead, markAllRead } = useNotificationActions();

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const pagination = data?.pagination;

  const open = (item: StudentNotificationItem) => navigation.navigate('NotificacaoDetalhe', { notificationId: item.id });
  const act = (item: StudentNotificationItem, go: () => void) => {
    if (!item.is_read) markRead.mutate(item.id);
    go();
  };

  /** Ação direta por tipo: abrir o simulado, ver a cobrança. */
  const actionFor = (item: StudentNotificationItem) => {
    const examId = item.data?.exam_id;
    if ((item.type === 'exam_pending' || item.type === 'exam_result') && examId) {
      return <Button size="sm" variant={item.type === 'exam_pending' && !item.is_read ? 'primary' : 'secondary'} label={item.type === 'exam_result' ? 'Ver resultado' : 'Ver simulado'}
        onPress={() => act(item, () => navigation.navigate('AlunoTabs', { screen: 'Simulados', params: { screen: 'SimuladoDetalhe', params: { examId } } }))} />;
    }
    if (item.type === 'billing_due') {
      return <Button size="sm" variant="secondary" label="Ver cobrança" onPress={() => act(item, () => navigation.navigate('AlunoTabs', { screen: 'Financeiro' }))} />;
    }
    return null;
  };

  const groups: [string, StudentNotificationItem[]][] = [];
  for (const item of items) {
    const g = groupOf(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(item);
    else groups.push([g, [item]]);
  }

  const filter = (
    <SegmentedControl label="Filtro" options={['Todas', unread ? `Não lidas · ${unread}` : 'Não lidas']} value={unreadOnly ? 1 : 0}
      onChange={(i) => { setUnreadOnly(i === 1); setPage(1); }} />
  );

  const list = isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : !items.length ? (
      <EmptyState icon="bell" title={unreadOnly ? 'Nada para ler' : 'Nenhuma notificação ainda'}
        text={unreadOnly ? 'Você já leu todas as mensagens.' : 'Avisos da escola, simulados liberados e questões novas aparecem aqui.'} />
    ) : (
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {groups.map(([label, list]) => (
          <View key={label}>
            <Txt variant="overline" tone="subtle" style={{ paddingTop: space[4], paddingHorizontal: space[4], paddingBottom: 4 }}>{label}</Txt>
            {list.map((item, i) => (
              <NotificationItem key={item.id} first={i === 0} unread={!item.is_read} icon={ICON[item.type] ?? 'bell'} title={item.title}
                text={plain(item.body ?? '')} time={timeOf(item.created_at)} action={actionFor(item)} onPress={() => open(item)} />
            ))}
          </View>
        ))}
      </Card>
    );

  const pager = pagination && pagination.last_page > 1 ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Button variant="ghost" icon="chevron-left" label="Anteriores" disabled={page <= 1} onPress={() => setPage((x) => Math.max(1, x - 1))} />
      <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{pagination.current_page} de {pagination.last_page}</Txt>
      <Button variant="ghost" iconRight="chevron-right" label="Mais antigas" disabled={page >= pagination.last_page} onPress={() => setPage((x) => x + 1)} />
    </View>
  ) : null;

  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Notificações" subtitle="Avisos da escola, simulados e novidades"
            actions={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ width: 260 }}>{filter}</View>
                <Button variant="ghost" icon="check" label="Marcar todas como lidas" disabled={!unread} loading={markAllRead.isPending} onPress={() => markAllRead.mutate()} />
              </View>
            } />
          <View style={{ maxWidth: 760, gap: space[4] }}>{list}{pager}</View>
        </PageBody>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Notificações" subtitle={unread ? `${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : 'Tudo lido'}
        leading={<IconButton icon="arrow-left" label="Voltar" onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AlunoTabs'))} />} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={22} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1 }}>{filter}</View>
            {unread ? <LinkButton label="Marcar como lidas" onPress={() => markAllRead.mutate()} /> : null}
          </View>
          {list}
          {pager}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
