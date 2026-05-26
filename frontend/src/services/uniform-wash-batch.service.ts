import api from './api';
import type { UniformItemCondition } from '@/types/uniform';

export type WashBatchStatus = 'CREATED' | 'SENT_TO_LAUNDRY' | 'RETURNED_FROM_LAUNDRY' | 'INSPECTED' | 'CANCELLED';

export interface WashBatchItem {
  id: string;
  batchId: string;
  variantId: string;
  quantity: number;
  returnLineId: string | null;
  postWashCondition: UniformItemCondition | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  variant?: {
    id: string;
    size: string;
    barcode: string;
    item: { id: string; name: string; division: string; type: string };
  };
}

export interface WashBatch {
  id: string;
  status: WashBatchStatus;
  vendor: string | null;
  notes: string | null;
  sentAt: string | null;
  returnedAt: string | null;
  inspectedAt: string | null;
  createdById: string | null;
  inspectedById: string | null;
  createdAt: string;
  updatedAt: string;
  items: WashBatchItem[];
}

export const washBatchService = {
  async list(params?: { status?: WashBatchStatus | WashBatchStatus[] }) {
    const r = await api.get('/api/uniforms/wash-batches', {
      params: params?.status ? { status: Array.isArray(params.status) ? params.status.join(',') : params.status } : {},
    });
    return r.data as { data: WashBatch[] };
  },
  async get(id: string) {
    const r = await api.get(`/api/uniforms/wash-batches/${id}`);
    return r.data as { data: WashBatch };
  },
  async create(data: { vendor?: string; notes?: string; items: { variantId: string; quantity?: number }[] }) {
    const r = await api.post('/api/uniforms/wash-batches', data);
    return r.data as { data: WashBatch };
  },
  async addItems(id: string, items: { variantId: string; quantity?: number }[]) {
    const r = await api.post(`/api/uniforms/wash-batches/${id}/items`, { items });
    return r.data as { data: WashBatch };
  },
  async send(id: string, opts?: { vendor?: string; notes?: string }) {
    const r = await api.post(`/api/uniforms/wash-batches/${id}/send`, opts || {});
    return r.data as { data: WashBatch };
  },
  async markReturned(id: string, opts?: { notes?: string }) {
    const r = await api.post(`/api/uniforms/wash-batches/${id}/return`, opts || {});
    return r.data as { data: WashBatch };
  },
  async inspect(id: string, inspections: { itemId: string; postWashCondition: UniformItemCondition; notes?: string }[]) {
    const r = await api.post(`/api/uniforms/wash-batches/${id}/inspect`, { inspections });
    return r.data as { data: WashBatch };
  },
  async cancel(id: string) {
    const r = await api.post(`/api/uniforms/wash-batches/${id}/cancel`);
    return r.data as { data: WashBatch };
  },
};
