import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getApiErrorMessage } from '../../../lib/apiError';
import { type CalendarEventItem, type CalendarEventType, eventsForDay, isSameDay, toDateKey } from '../../../services/calendar.service';
import { useStudentCalendar } from '../hooks/useStudentCalendar';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, Button, Card, Chip, Chips, EVENT_KIND, EventItem, IconButton, MonthCalendar, Notice, PageBody, PageHeader, ScreenBody,
  SegmentedControl, Tag, Txt, font, space, useLayoutMode, usePalette, type CalendarDayEvents, type EventKind,
} from '../../../ui';

type Route = RouteProp<AlunoStackParamList, 'Calendario'>;
type Nav = NativeStackNavigationProp<AlunoStackParamList>;

const KIND: Record<CalendarEventType, EventKind> = {
  exam: 'simulado', exam_presential: 'presencial', task: 'tarefa', billing: 'cobranca', class: 'aula', school: 'evento', general: 'geral',
};
type Filter = 'all' | 'exam' | 'class' | 'task' | 'billing';
const FILTERS: { id: Filter; label: string; types: CalendarEventType[] }[] = [
  { id: 'all', label: 'Tudo', types: [] },
  { id: 'exam', label: 'Simulados', types: ['exam', 'exam_presential'] },
  { id: 'class', label: 'Aulas', types: ['class'] },
  { id: 'task', label: 'Tarefas', types: ['task'] },
  { id: 'billing', label: 'Cobranças', types: ['billing'] },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = (d: Date) => cap(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a: Date, b: Date) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000);

/** "Hoje, quinta 8" · "Sexta, 10" · "Sex, 10/10" */
function dayTitle(d: Date, today: Date, short = false): string {
  const diff = dayDiff(d, today);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: short ? 'short' : 'long' }).replace('.', '').replace('-feira', '');
  if (diff === 0) return `Hoje, ${weekday} ${d.getDate()}`;
  if (diff === 1) return `Amanhã, ${weekday} ${d.getDate()}`;
  return short ? `${cap(weekday)}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : `${cap(weekday)}, ${d.getDate()}`;
}
const relative = (d: Date, today: Date) => {
  const diff = dayDiff(d, today);
  return diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff > 1 ? `em ${diff} dias` : `há ${-diff} dias`;
};

/** Calendário (protótipos "TelaCalendario" e "DesktopCalendario"): ponto accent = pede ação; neutro = informativo. */
export function CalendarScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();
  const today = useMemo(() => new Date(), []);
  const initial = route.params?.selectedDate ? new Date(`${route.params.selectedDate}T12:00:00`) : today;

  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'month' | 'agenda'>('month');

  const monthQuery = useStudentCalendar(toDateKey(month), toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)));
  const nextQuery = useStudentCalendar(toDateKey(addDays(selected, 1)), toDateKey(addDays(selected, 7)));

  const types = FILTERS.find((f) => f.id === filter)?.types ?? [];
  const keep = (e: CalendarEventItem) => !types.length || types.includes(e.type);
  const events = (monthQuery.data?.items ?? []).filter(keep);
  const sortByStart = (a: CalendarEventItem, b: CalendarEventItem) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  const dayEvents = eventsForDay(events, selected).sort(sortByStart);
  const upcoming = (nextQuery.data?.items ?? []).filter(keep).sort(sortByStart);

  // Eventos por dia do mês para a grade.
  const byDay = useMemo(() => {
    const map: Record<number, CalendarDayEvents> = {};
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const list = eventsForDay(events, new Date(month.getFullYear(), month.getMonth(), d)).sort(sortByStart);
      if (list.length) map[d] = list.map((e) => ({ kind: KIND[e.type] ?? 'geral', label: e.title }));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula quando os eventos/filtro mudam
  }, [monthQuery.data, filter, month]);

  const sameMonth = (d: Date) => d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next);
  };
  const goToday = () => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); };

  const actionFor = (e: CalendarEventItem) => {
    if (e.exam_id) {
      return <Button size="sm" label="Abrir" onPress={() => navigation.navigate('AlunoTabs', { screen: 'Simulados', params: { screen: 'SimuladoDetalhe', params: { examId: e.exam_id as number } } })} />;
    }
    if (e.invoice_id || e.type === 'billing') return <Button size="sm" variant="secondary" label="Ver cobrança" onPress={() => navigation.navigate('AlunoTabs', { screen: 'Financeiro' })} />;
    return undefined;
  };
  const item = (e: CalendarEventItem, i: number) => {
    const kind = KIND[e.type] ?? 'geral';
    const where = [e.school_class?.name, e.location].filter(Boolean).join(' · ');
    return (
      <EventItem key={`${e.id}-${e.starts_at}`} first={i === 0} kind={kind}
        kindLabel={kind === 'aula' && e.school_class ? `Aula · ${e.school_class.name}` : e.type_label || EVENT_KIND[kind].label}
        title={e.title} subtitle={kind === 'aula' ? e.location : where || e.description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 90) || null}
        start={e.all_day ? null : hm(e.starts_at)} end={!e.all_day && e.ends_at ? hm(e.ends_at) : null} action={actionFor(e)} />
    );
  };

  /** Lista agrupada por dia (próximos 7 dias e modo Agenda). */
  const grouped = (list: CalendarEventItem[]) => {
    const groups: [Date, CalendarEventItem[]][] = [];
    for (const e of list) {
      const d = new Date(e.starts_at);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last[0], d)) last[1].push(e);
      else groups.push([d, [e]]);
    }
    return groups;
  };
  const dayHead = (title: string, sub?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2], paddingVertical: 4 }}>
      <Txt variant="titleSm">{title}</Txt>
      {sub ? <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{sub}</Txt> : null}
    </View>
  );
  const legend = (center?: boolean) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4], justifyContent: center ? 'center' : 'flex-start', marginTop: space[3] }}>
      {[[p.accent, isDesktop ? 'Pede ação sua: simulado, tarefa, cobrança' : 'Pede ação'], [p.inkSubtle, isDesktop ? 'Informativo: aula, evento, geral' : 'Informativo']].map(([c, l]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
          <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{l}</Txt>
        </View>
      ))}
    </View>
  );
  const monthNav = (outline?: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <IconButton icon="chevron-left" label="Mês anterior" variant={outline ? 'outline' : 'plain'} onPress={() => changeMonth(-1)} />
      <Txt variant="title" style={{ fontSize: outline ? 18 : 16, ...font.extrabold, minWidth: outline ? 170 : undefined, textAlign: 'center', flex: outline ? undefined : 1 }}>{monthLabel(month)}</Txt>
      <IconButton icon="chevron-right" label="Próximo mês" variant={outline ? 'outline' : 'plain'} onPress={() => changeMonth(1)} />
    </View>
  );

  const errorNotice = monthQuery.isError ? <Notice tone="danger" title="Não foi possível carregar o calendário" text={getApiErrorMessage(monthQuery.error, 'Tente de novo.')} /> : null;
  const loading = monthQuery.isLoading ? <ActivityIndicator color={p.brand} /> : null;
  const refresh = <RefreshControl refreshing={monthQuery.isRefetching} onRefresh={() => { monthQuery.refetch(); nextQuery.refetch(); }} tintColor={p.brand} colors={[p.brand]} />;
  const selectedInMonth = sameMonth(selected);
  const emptyDay = <Txt tone="subtle" style={{ paddingVertical: space[3] }}>Nada marcado para este dia.</Txt>;

  if (isDesktop) {
    const agenda = grouped(events.slice().sort(sortByStart));
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Calendário" subtitle="Aulas, simulados, tarefas e cobranças da sua turma"
            actions={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ width: 220 }}><SegmentedControl label="Visualização" options={['Mês', 'Agenda']} value={view === 'month' ? 0 : 1} onChange={(i) => setView(i ? 'agenda' : 'month')} /></View>
                <Button variant="secondary" icon="calendar" label="Hoje" onPress={goToday} />
              </View>
            } />
          {errorNotice}
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
            <Card style={{ flex: 1, minWidth: 0, padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginBottom: space[4] }}>
                {monthNav(true)}
                <View style={{ flex: 1 }} />
                <Chips>{FILTERS.map((f) => <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />)}</Chips>
              </View>
              {loading}
              {view === 'month' ? (
                <MonthCalendar year={month.getFullYear()} month={month.getMonth()} events={byDay} selected={selectedInMonth ? selected.getDate() : null}
                  today={sameMonth(today) ? today.getDate() : null} onSelect={(d) => setSelected(new Date(month.getFullYear(), month.getMonth(), d))} />
              ) : agenda.length ? (
                <View style={{ gap: space[3] }}>
                  {agenda.map(([d, list]) => (
                    <View key={d.toISOString()}>
                      {dayHead(dayTitle(d, today, true), relative(d, today))}
                      {list.map(item)}
                    </View>
                  ))}
                </View>
              ) : <Txt tone="subtle">Nada marcado neste mês.</Txt>}
              {view === 'month' ? legend() : null}
            </Card>
            <View style={{ width: 360, gap: space[4] }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], marginBottom: space[2] }}>
                  <Txt variant="titleSm">{cap(selected.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', ''))}</Txt>
                  {isSameDay(selected, today) ? <Tag label="Hoje" /> : null}
                </View>
                {dayEvents.length ? dayEvents.map(item) : emptyDay}
              </Card>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], marginBottom: space[2] }}>
                  <Txt variant="titleSm">Próximos 7 dias</Txt>
                  <Txt variant="bodySm" tone="subtle">{upcoming.length} {upcoming.length === 1 ? 'evento' : 'eventos'}</Txt>
                </View>
                {upcoming.length ? grouped(upcoming).map(([d, list]) => (
                  <View key={d.toISOString()}>
                    {dayHead(dayTitle(d, today, true), relative(d, today))}
                    {list.map(item)}
                  </View>
                )) : <Txt tone="subtle">Nada marcado nos próximos dias.</Txt>}
              </Card>
            </View>
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Calendário" subtitle={monthLabel(month)}
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} />
          : <IconButton icon="arrow-left" label="Voltar" onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AlunoTabs'))} />}
        trailing={<Button variant="ghost" size="sm" label="Hoje" onPress={goToday} />} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={20} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {errorNotice}
          <Card>
            <View style={{ marginTop: -6, marginHorizontal: -6, marginBottom: space[2] }}>{monthNav()}</View>
            <MonthCalendar compact year={month.getFullYear()} month={month.getMonth()} events={byDay} selected={selectedInMonth ? selected.getDate() : null}
              today={sameMonth(today) ? today.getDate() : null} onSelect={(d) => setSelected(new Date(month.getFullYear(), month.getMonth(), d))} />
            {legend(true)}
          </Card>
          {loading}
          <View style={{ gap: 10 }}>
            {dayHead(dayTitle(selected, today), dayEvents.length ? `${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}` : undefined)}
            <Card style={{ paddingVertical: 4 }}>{dayEvents.length ? dayEvents.map(item) : emptyDay}</Card>
          </View>
          {grouped(upcoming).map(([d, list]) => (
            <View key={d.toISOString()} style={{ gap: 10 }}>
              {dayHead(dayTitle(d, today), relative(d, today))}
              <Card style={{ paddingVertical: 4 }}>{list.map(item)}</Card>
            </View>
          ))}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
