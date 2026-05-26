import api from './api';
import type { NotificationListResponse } from '@/types/notification';

export const notificationService = {
  async list(opts?: { unreadOnly?: boolean; limit?: number }) {
    const r = await api.get('/api/notifications', { params: opts });
    return r.data as { data: NotificationListResponse };
  },
  async markRead(id: string) {
    const r = await api.post(`/api/notifications/${id}/read`);
    return r.data;
  },
  async markAllRead() {
    const r = await api.post('/api/notifications/mark-all-read');
    return r.data;
  },
};
