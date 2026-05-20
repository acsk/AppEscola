import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '../../../services/notifications.service';
import { notificationKeys } from '../queryKeys';

export function useNotificationActions() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidateAll,
  });

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidateAll,
  });

  return { markRead, markAllRead, invalidateAll };
}
