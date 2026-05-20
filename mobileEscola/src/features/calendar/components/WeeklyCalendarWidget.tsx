import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme';
import { platformShadow } from '../../../lib/shadow';
import {
  CalendarEventItem,
  calendarIconName,
  eventsForDay,
  formatEventTime,
  isSameDay,
  startOfWeekMonday,
  toDateKey,
} from '../../../services/calendar.service';
import { useStudentCalendar } from '../hooks/useStudentCalendar';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type Props = {
  enabled?: boolean;
};

export function WeeklyCalendarWidget({ enabled = true }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<AlunoStackParamList>>();
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart]
  );

  const from = toDateKey(weekDays[0]);
  const to = toDateKey(weekDays[6]);

  const { data, isLoading } = useStudentCalendar(from, to, enabled);
  const events = data?.items ?? [];

  const dayEvents = useMemo(
    () => eventsForDay(events, selectedDay),
    [events, selectedDay]
  );

  const today = new Date();

  const openEvent = (event: CalendarEventItem) => {
    if (event.exam_id) {
      navigation.navigate('AlunoTabs', {
        screen: 'Simulados',
        params: { screen: 'SimuladoDetalhe', params: { examId: event.exam_id } },
      });
      return;
    }
    if (event.invoice_id || event.type === 'billing') {
      navigation.navigate('AlunoTabs', { screen: 'Financeiro' });
      return;
    }
    navigation.navigate('Calendario', { selectedDate: toDateKey(selectedDay) });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Agenda da semana</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Calendario')}
          activeOpacity={0.8}
        >
          <Text style={styles.link}>Calendário completo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => {
            const prev = new Date(weekAnchor);
            prev.setDate(prev.getDate() - 7);
            setWeekAnchor(prev);
          }}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {weekDays[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          {' – '}
          {weekDays[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        <TouchableOpacity
          onPress={() => {
            const next = new Date(weekAnchor);
            next.setDate(next.getDate() + 7);
            setWeekAnchor(next);
          }}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.daysRow}>
        {weekDays.map((day, index) => {
          const selected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          const count = eventsForDay(events, day).length;
          return (
            <TouchableOpacity
              key={toDateKey(day)}
              style={[styles.dayCell, selected && styles.dayCellSelected]}
              onPress={() => setSelectedDay(day)}
              activeOpacity={0.85}
            >
              <Text style={[styles.dayName, selected && styles.dayNameSelected]}>
                {WEEKDAY_LABELS[index]}
              </Text>
              <View style={[styles.dayNumWrap, isToday && styles.dayNumToday]}>
                <Text style={[styles.dayNum, selected && styles.dayNumSelected]}>
                  {day.getDate()}
                </Text>
              </View>
              {count > 0 ? <View style={styles.dot} /> : <View style={styles.dotPlaceholder} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
      ) : dayEvents.length === 0 ? (
        <Text style={styles.empty}>Nenhum evento neste dia.</Text>
      ) : (
        <View style={styles.eventsList}>
          {dayEvents.slice(0, 3).map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventRow}
              onPress={() => openEvent(event)}
              activeOpacity={0.85}
            >
              <View style={[styles.eventDot, { backgroundColor: event.type_color }]} />
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {formatEventTime(event)}
                  {event.location ? ` · ${event.location}` : ''}
                </Text>
              </View>
              <Ionicons
                name={calendarIconName(event.type_icon) as any}
                size={18}
                color={event.type_color}
              />
            </TouchableOpacity>
          ))}
          {dayEvents.length > 3 ? (
            <TouchableOpacity onPress={() => navigation.navigate('Calendario')}>
              <Text style={styles.moreLink}>+{dayEvents.length - 3} evento(s)</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const cardShadow = platformShadow({ color: '#6D4DE6', opacity: 0.06, radius: 12, elevation: 2 });

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    ...(cardShadow as object),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 12,
  },
  dayCellSelected: { backgroundColor: colors.soft },
  dayName: { fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  dayNameSelected: { color: colors.primary },
  dayNumWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayNum: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dayNumSelected: { color: colors.primary },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  dotPlaceholder: { width: 6, height: 6, marginTop: 4 },
  empty: { fontSize: 13, color: colors.muted, marginTop: 14, textAlign: 'center' },
  eventsList: { marginTop: 12, gap: 8 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  eventDot: { width: 4, height: 36, borderRadius: 2 },
  eventBody: { flex: 1, minWidth: 0 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  eventMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  moreLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 4,
  },
});
