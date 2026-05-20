import { useQuery } from '@tanstack/react-query';
import {
  CALENDAR_LEGEND_ORDER,
  type CalendarLegendItem,
} from '../components/CalendarColorLegend';
import { fetchStudentCalendarTypes } from '../../../services/calendar.service';

export function useCalendarTypes() {
  return useQuery({
    queryKey: ['calendar-types'],
    queryFn: fetchStudentCalendarTypes,
    staleTime: 1000 * 60 * 60,
  });
}

export function buildCalendarLegendItems(
  types: Record<string, { label: string; color: string }> | undefined,
): CalendarLegendItem[] {
  if (!types) return [];

  return CALENDAR_LEGEND_ORDER.reduce<CalendarLegendItem[]>((items, key) => {
    const meta = types[key];
    if (meta) {
      items.push({ key, label: meta.label, color: meta.color });
    }
    return items;
  }, []);
}
