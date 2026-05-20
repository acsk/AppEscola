import { useQuery } from '@tanstack/react-query';
import { fetchStudentCalendarEvents } from '../../../services/calendar.service';
import { calendarKeys } from '../queryKeys';

export function useStudentCalendar(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: calendarKeys.range(from, to),
    queryFn: () => fetchStudentCalendarEvents({ from, to }),
    enabled: enabled && Boolean(from && to),
    staleTime: 60_000,
  });
}
