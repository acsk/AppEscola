export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  list: (page: number, unreadOnly: boolean) =>
    [...notificationKeys.all, 'list', page, unreadOnly] as const,
  detail: (id: number) => [...notificationKeys.all, 'detail', id] as const,
};
