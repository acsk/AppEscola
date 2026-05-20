import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { getApiErrorMessage } from '../../../lib/apiError';
import { platformShadow } from '../../../lib/shadow';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import {
  CalendarEventItem,
  calendarIconName,
  eventsForDay,
  formatEventTime,
  isSameDay,
  toDateKey,
} from '../../../services/calendar.service';
import { useStudentCalendar } from '../hooks/useStudentCalendar';
import { buildCalendarLegendItems, useCalendarTypes } from '../hooks/useCalendarTypes';
import { CalendarColorLegend } from '../components/CalendarColorLegend';
import type { AlunoStackParamList } from '../../../navigation/stacks/AlunoStack';

type Route = RouteProp<AlunoStackParamList, 'Calendario'>;

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const headerShadow = platformShadow({ color: '#7C3AED', opacity: 0.08, radius: 18, elevation: 3 });
const cardShadow = platformShadow({ color: '#6D4DE6', opacity: 0.06, radius: 14, elevation: 2 });

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(month: Date): (Date | null)[][] {
  const start = monthStart(month);
  const firstWeekday = start.getDay() === 0 ? 6 : start.getDay() - 1;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMonthLabel(date: Date): string {
  return capitalize(date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
}

function formatAgendaDate(date: Date): string {
  return capitalize(
    date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }),
  );
}

function formatEventCount(count: number): string {
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

function formatFoundEvents(count: number): string {
  return `${formatEventCount(count)} ${count === 1 ? 'encontrado' : 'encontrados'}`;
}

function tint(hex: string | undefined, alpha: string, fallback: string): string {
  if (!hex || !hex.startsWith('#')) return fallback;
  return `${hex}${alpha}`;
}

function isEventPressable(event: CalendarEventItem): boolean {
  return Boolean(event.exam_id || event.invoice_id || event.type === 'billing');
}

function eventActionLabel(event: CalendarEventItem): string | null {
  if (event.exam_id) return 'Abrir simulado';
  if (event.invoice_id || event.type === 'billing') return 'Ver financeiro';
  return null;
}

export function CalendarScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createCalendarStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<AlunoStackParamList>>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const initialDate = route.params?.selectedDate
    ? new Date(`${route.params.selectedDate}T12:00:00`)
    : new Date();

  const [month, setMonth] = useState(() => monthStart(initialDate));
  const [selectedDay, setSelectedDay] = useState(initialDate);

  const rangeFrom = toDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const rangeTo = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const { data: typesData } = useCalendarTypes();
  const legendItems = useMemo(() => buildCalendarLegendItems(typesData), [typesData]);

  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    isError,
    error,
  } = useStudentCalendar(rangeFrom, rangeTo);
  const events = data?.items ?? [];
  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const dayEvents = useMemo(() => eventsForDay(events, selectedDay), [events, selectedDay]);
  const today = new Date();
  const errorMessage = isError
    ? getApiErrorMessage(error, 'Não foi possível carregar o calendário.')
    : null;

  const changeMonth = (offset: number) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth);
    setSelectedDay(isSameDay(monthStart(today), nextMonth) ? today : nextMonth);
  };

  const goToToday = () => {
    setMonth(monthStart(today));
    setSelectedDay(today);
  };

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
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.headerGlowPrimary} />
        <View style={styles.headerGlowSecondary} />
        <View style={styles.headerRow}>
          <MenuButton />
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Calendário</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Agenda escolar</Text>
          </View>
          <TouchableOpacity
            onPress={() => refetch()}
            style={styles.refreshBtn}
            activeOpacity={0.85}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh-outline" size={21} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{isLoading ? '--' : events.length}</Text>
            <Text style={styles.summaryLabel}>no mês</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, dayEvents.length > 0 && styles.summaryValueActive]}>
              {isLoading ? '--' : dayEvents.length}
            </Text>
            <Text style={styles.summaryLabel}>no dia</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.monthPanel}>
          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => changeMonth(-1)}
              style={styles.navBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>

            <View style={styles.monthTitleWrap}>
              <Text style={styles.monthLabel} numberOfLines={1}>{formatMonthLabel(month)}</Text>
              <Text style={styles.monthSubtitle} numberOfLines={1}>
                {isLoading ? 'Carregando eventos' : formatFoundEvents(events.length)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => changeMonth(1)}
              style={styles.navBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={goToToday} style={styles.todayBtn} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.todayBtnText}>Hoje</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.gridCard}>
          <View style={styles.weekHeader}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekHeaderText}>
                {label}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={`w-${wi}`} style={styles.weekRow}>
              {week.map((day, di) => {
                if (!day) {
                  return <View key={`e-${wi}-${di}`} style={styles.dayCell} />;
                }
                const selected = isSameDay(day, selectedDay);
                const isToday = isSameDay(day, today);
                const dayItems = eventsForDay(events, day);
                const count = dayItems.length;

                return (
                  <TouchableOpacity
                    key={toDateKey(day)}
                    style={[styles.dayCell, selected && styles.dayCellSelected]}
                    onPress={() => setSelectedDay(day)}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.dayNumWrap,
                        isToday && styles.dayToday,
                        selected && styles.dayNumWrapSelected,
                      ]}
                    >
                      <Text style={[styles.dayNum, selected && styles.dayNumSelected]}>
                        {day.getDate()}
                      </Text>
                    </View>
                    {count > 0 ? (
                      <View style={styles.dayMarkers}>
                        {dayItems.slice(0, 3).map((ev) => (
                          <View
                            key={ev.id}
                            style={[styles.miniDot, { backgroundColor: ev.type_color }]}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={styles.dayMarkersPlaceholder} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <CalendarColorLegend items={legendItems} />
        </View>

        <View style={styles.agendaHeader}>
          <View style={styles.agendaTitleWrap}>
            <Text style={styles.agendaTitle}>{formatAgendaDate(selectedDay)}</Text>
            <Text style={styles.agendaSubtitle}>
              {isLoading ? 'Carregando...' : formatEventCount(dayEvents.length)}
            </Text>
          </View>
          <View style={styles.agendaBadge}>
            <Ionicons name="list-outline" size={16} color={colors.primary} />
            <Text style={styles.agendaBadgeText}>Agenda</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Carregando agenda...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateBox}>
            <View style={styles.stateIcon}>
              <Ionicons name="alert-circle-outline" size={34} color={colors.debit} />
            </View>
            <Text style={styles.stateTitle}>Não foi possível carregar</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : dayEvents.length === 0 ? (
          <View style={styles.stateBox}>
            <View style={styles.stateIcon}>
              <Ionicons name="calendar-clear-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>Agenda livre</Text>
            <Text style={styles.stateText}>Nenhum evento cadastrado para este dia.</Text>
          </View>
        ) : (
          <View style={styles.eventsList}>
            {dayEvents.map((event) => {
              const actionLabel = eventActionLabel(event);
              const pressable = isEventPressable(event);

              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventCard,
                    {
                      borderColor: tint(event.type_color, '34', colors.soft),
                      backgroundColor: tint(event.type_color, '0D', colors.soft),
                    },
                  ]}
                  activeOpacity={pressable ? 0.85 : 1}
                  onPress={() => openEvent(event)}
                  disabled={!pressable}
                >
                  <View style={[styles.eventIcon, { backgroundColor: tint(event.type_color, '18', colors.soft) }]}>
                    <Ionicons
                      name={calendarIconName(event.type_icon) as any}
                      size={21}
                      color={event.type_color}
                    />
                  </View>

                  <View style={styles.eventBody}>
                    <View style={styles.eventMetaRow}>
                      <Text style={[styles.eventType, { color: event.type_color }]} numberOfLines={1}>
                        {event.type_label}
                      </Text>
                      <Text style={styles.eventTime} numberOfLines={1}>{formatEventTime(event)}</Text>
                    </View>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {event.title}
                    </Text>
                    {event.location || event.course?.name || event.school_class?.name ? (
                      <Text style={styles.eventMeta} numberOfLines={1}>
                        {[event.location, event.course?.name, event.school_class?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                    {actionLabel ? (
                      <Text style={styles.eventAction}>{actionLabel}</Text>
                    ) : null}
                  </View>

                  {pressable ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function createCalendarStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  headerSubtitle: { fontSize: 12, color: colors.muted, fontWeight: '700', marginTop: 2 },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EEE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
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
  summaryValueActive: { color: colors.primary },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: '800', marginTop: 2 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },
  content: { padding: 16, paddingBottom: 28 },
  monthPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  monthNav: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    padding: 10,
    ...(cardShadow as object),
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleWrap: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
  monthLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'center',
  },
  monthSubtitle: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 2 },
  todayBtn: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayBtnText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    marginBottom: 18,
    ...(cardShadow as object),
  },
  weekHeader: { flexDirection: 'row', marginBottom: 8 },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
  },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    minHeight: 54,
    borderRadius: 12,
  },
  dayCellSelected: { backgroundColor: colors.soft },
  dayNumWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumWrapSelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayNum: { fontSize: 14, fontWeight: '800', color: colors.ink },
  dayNumSelected: { color: colors.surface },
  dayMarkers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: 5,
    height: 6,
  },
  miniDot: { width: 5, height: 5, borderRadius: 3 },
  dayMarkersPlaceholder: { height: 11 },
  agendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  agendaTitleWrap: { flex: 1, minWidth: 0 },
  agendaTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  agendaSubtitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 2 },
  agendaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.soft,
  },
  agendaBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    padding: 24,
    minHeight: 150,
  },
  stateIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stateTitle: { fontSize: 18, color: colors.ink, fontWeight: '900', textAlign: 'center' },
  stateText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 7,
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: { fontSize: 13, fontWeight: '800', color: colors.surface },
  eventsList: { gap: 10 },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  eventIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventBody: { flex: 1, minWidth: 0 },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  eventType: { flex: 1, fontSize: 12, fontWeight: '900' },
  eventTime: { fontSize: 12, color: colors.muted, fontWeight: '800', textAlign: 'right' },
  eventTitle: { fontSize: 17, fontWeight: '900', color: colors.ink, lineHeight: 22 },
  eventMeta: { fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 5 },
  eventAction: { fontSize: 13, color: colors.primary, fontWeight: '900', marginTop: 8 },
});
}
