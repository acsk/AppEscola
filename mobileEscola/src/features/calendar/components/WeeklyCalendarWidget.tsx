import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CalendarEventItem,
  eventsForDay,
  formatEventTime,
  isSameDay,
  startOfWeekMonday,
  toDateKey,
} from '../../../services/calendar.service';
import { useStudentCalendar } from '../hooks/useStudentCalendar';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';
import { Card, Icon, IconButton, LinkButton, Section, Txt, WeekStrip, radius, space, usePalette, type IconName } from '../../../ui';

/** "Sext" evita Chrome Translate: Sex → Sexo. */
const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sext', 'Sáb', 'Dom'];

const EVENT_ICON: Record<string, IconName> = { exam: 'clipboard', billing: 'wallet', class: 'book', holiday: 'calendar' };

type Props = { enabled?: boolean };

/** Agenda da semana (protótipo "TelaInicio"): faixa de dias + eventos do dia escolhido. */
export function WeeklyCalendarWidget({ enabled = true }: Props) {
  const p = usePalette();
  const navigation = useNavigation<NativeStackNavigationProp<AlunoStackParamList>>();
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart]
  );
  const { data, isLoading } = useStudentCalendar(toDateKey(weekDays[0]), toDateKey(weekDays[6]), enabled);
  const events = data?.items ?? [];
  const dayEvents = useMemo(() => eventsForDay(events, selectedDay), [events, selectedDay]);
  const today = new Date();

  const openEvent = (event: CalendarEventItem) => {
    if (event.exam_id) {
      navigation.navigate('AlunoTabs', { screen: 'Simulados', params: { screen: 'SimuladoDetalhe', params: { examId: event.exam_id } } });
      return;
    }
    if (event.invoice_id || event.type === 'billing') {
      navigation.navigate('AlunoTabs', { screen: 'Financeiro' });
      return;
    }
    navigation.navigate('Calendario', { selectedDate: toDateKey(selectedDay) });
  };

  const shiftWeek = (weeks: number) => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + weeks * 7);
    setWeekAnchor(d);
    const day = new Date(selectedDay);
    day.setDate(day.getDate() + weeks * 7);
    setSelectedDay(day);
  };

  const isToday = isSameDay(selectedDay, today);
  const dayLabel = isToday ? 'Hoje' : selectedDay.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <Section title="Agenda da semana" action={<LinkButton label="Calendário" onPress={() => navigation.navigate('Calendario', { selectedDate: toDateKey(selectedDay) })} />}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
          <IconButton icon="chevron-left" label="Semana anterior" iconSize={18} onPress={() => shiftWeek(-1)} />
          <Txt variant="bodySm" tone="subtle">
            {weekDays[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {weekDays[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </Txt>
          <IconButton icon="chevron-right" label="Próxima semana" iconSize={18} onPress={() => shiftWeek(1)} />
        </View>
        <WeekStrip
          days={weekDays.map((d, i) => ({
            key: toDateKey(d), dow: WEEKDAY_LABELS[i], day: d.getDate(),
            mark: eventsForDay(events, d).length > 0, today: isSameDay(d, today),
          }))}
          selectedKey={toDateKey(selectedDay)}
          onSelect={(key) => setSelectedDay(weekDays.find((d) => toDateKey(d) === key) ?? selectedDay)}
        />
        {isLoading ? (
          <ActivityIndicator color={p.brand} style={{ marginTop: space[3] }} />
        ) : dayEvents.length === 0 ? (
          <View style={{ marginTop: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: p.line }}>
            <Txt variant="bodySm" tone="subtle">{dayLabel}: nada marcado.</Txt>
          </View>
        ) : (
          dayEvents.map((event) => (
            <Pressable key={event.id} accessibilityRole="button" onPress={() => openEvent(event)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[3], paddingTop: space[3],
                borderTopWidth: 1, borderTopColor: p.line, opacity: pressed ? 0.7 : 1,
              })}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={EVENT_ICON[event.type] ?? 'calendar'} size={18} color={p.inkMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="label" numberOfLines={1}>{event.type === 'exam' ? `Simulado: ${event.title}` : event.title}</Txt>
                <Txt variant="bodySm" tone="subtle" numberOfLines={1}>
                  {dayLabel} · {formatEventTime(event)}{event.location ? ` · ${event.location}` : ''}
                </Txt>
              </View>
              <Icon name="chevron-right" size={18} color={p.inkSubtle} />
            </Pressable>
          ))
        )}
      </Card>
    </Section>
  );
}
