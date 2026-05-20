import { useQuery } from '@tanstack/react-query';
import { fetchNotifications } from '../../../services/notifications.service';
import { notificationKeys } from '../queryKeys';

export function useNotificationsList(page: number, unreadOnly: boolean) {
  return useQuery({
    queryKey: notificationKeys.list(page, unreadOnly),
    queryFn: () =>
      fetchNotifications({
        page,
        per_page: 20,
        unread_only: unreadOnly ? 1 : 0,
      }),
  });
}
