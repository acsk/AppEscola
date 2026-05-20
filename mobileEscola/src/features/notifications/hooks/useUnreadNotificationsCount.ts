import { useQuery } from '@tanstack/react-query';
import { fetchUnreadCount } from '../../../services/notifications.service';
import { notificationKeys } from '../queryKeys';

export function useUnreadNotificationsCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
