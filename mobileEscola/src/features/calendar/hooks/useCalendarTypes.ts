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

  return CALENDAR_LEGEND_ORDER.map((key) => {
    const meta = types[key];
    if (!meta) return null;
    return { key, label: meta.label, color: meta.color };
  }).filter((item): item is CalendarLegendItem => item !== null);
}
