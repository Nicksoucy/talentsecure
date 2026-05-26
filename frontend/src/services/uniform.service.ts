import api from './api';
import type {
  UniformItem,
  UniformVariant,
  UniformIssuance,
  UniformReturn,
  UniformMovement,
  Holding,
  AmountOwed,
  UniformDivision,
  UniformPieceType,
  UniformItemCondition,
} from '@/types/uniform';

export interface IssuanceLineInput {
  variantId?: string;
  customItemName?: string;
  quantity: number;
  unitCost?: number;
}
export interface ReturnLineInput {
  variantId?: string;
  customItemName?: string;
  quantity: number;
  condition: UniformItemCondition;
  unitReplacementCost?: number;
}

export const uniformService = {
  // Catalogue — items
  async listItems(params?: { division?: UniformDivision; type?: UniformPieceType; search?: string; includeInactive?: boolean }) {
    const r = await api.get('/api/uniforms/items', { params });
    return r.data as { data: UniformItem[] };
  },
  async createItem(data: Partial<UniformItem>) {
    const r = await api.post('/api/uniforms/items', data);
    return r.data;
  },
  async updateItem(id: string, data: Partial<UniformItem>) {
    const r = await api.put(`/api/uniforms/items/${id}`, data);
    return r.data;
  },
  async deleteItem(id: string) {
    const r = await api.delete(`/api/uniforms/items/${id}`);
    return r.data;
  },

  // Variants
  async listVariants(params?: { itemId?: string; search?: string; lowStock?: boolean; includeInactive?: boolean }) {
    const r = await api.get('/api/uniforms/variants', { params });
    return r.data as { data: UniformVariant[] };
  },
  async createVariant(itemId: string, data: { size: string; replacementCost?: number; reorderThreshold?: number; sku?: string }) {
    const r = await api.post(`/api/uniforms/items/${itemId}/variants`, data);
    return r.data;
  },
  async updateVariant(variantId: string, data: Partial<UniformVariant>) {
    const r = await api.put(`/api/uniforms/variants/${variantId}`, data);
    return r.data;
  },
  async deleteVariant(variantId: string) {
    const r = await api.delete(`/api/uniforms/variants/${variantId}`);
    return r.data;
  },
  async getByBarcode(barcode: string) {
    const r = await api.get(`/api/uniforms/variants/by-barcode/${encodeURIComponent(barcode)}`);
    return r.data as { data: UniformVariant };
  },
  labelUrl(variantId: string) {
    return `${api.defaults.baseURL}/api/uniforms/variants/${variantId}/label`;
  },
  async labelsSheet(variantIds: string[]) {
    const r = await api.post('/api/uniforms/labels', { variantIds }, { responseType: 'blob' });
    return r.data as Blob;
  },

  // Inventaire
  async listMovements(params?: { variantId?: string; type?: string; page?: number; limit?: number }) {
    const r = await api.get('/api/uniforms/movements', { params });
    return r.data as { data: UniformMovement[]; pagination: any };
  },
  async replenish(variantId: string, quantity: number, reason?: string) {
    const r = await api.post(`/api/uniforms/variants/${variantId}/replenish`, { quantity, reason });
    return r.data;
  },
  async adjust(variantId: string, quantity: number, reason?: string) {
    const r = await api.post(`/api/uniforms/variants/${variantId}/adjust`, { quantity, reason });
    return r.data;
  },

  // Remises
  async listIssuances(params?: { employeeId?: string; status?: string; division?: string; page?: number; limit?: number }) {
    const r = await api.get('/api/uniforms/issuances', { params });
    return r.data as { data: UniformIssuance[]; pagination: any };
  },
  async getIssuance(id: string) {
    const r = await api.get(`/api/uniforms/issuances/${id}`);
    return r.data as { data: UniformIssuance };
  },
  async createIssuance(data: { employeeId: string; division: UniformDivision; dueReturnAt?: string; notes?: string; lines: IssuanceLineInput[] }) {
    const r = await api.post('/api/uniforms/issuances', data);
    return r.data as { data: UniformIssuance };
  },
  async updateIssuance(id: string, data: { dueReturnAt?: string | null; notes?: string; lines?: IssuanceLineInput[] }) {
    const r = await api.put(`/api/uniforms/issuances/${id}`, data);
    return r.data;
  },
  async finalizeIssuance(id: string, opts?: { historical?: boolean; historicalDate?: string }) {
    const r = await api.post(`/api/uniforms/issuances/${id}/finalize`, opts || {});
    return r.data;
  },
  async uploadIssuancePdf(id: string, file: File) {
    const fd = new FormData();
    fd.append('pdf', file);
    const r = await api.post(`/api/uniforms/issuances/${id}/upload-pdf`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return r.data as { data: { formPdfStoragePath: string } };
  },
  async sendIssuanceSms(id: string) {
    const r = await api.post(`/api/uniforms/issuances/${id}/send-sms`);
    return r.data;
  },
  async counterSignIssuance(id: string, data: { employeeSignatureBase64?: string; employerSignatureBase64?: string; signedByName?: string; consents?: { payroll?: boolean; policy?: boolean; fit?: boolean } }) {
    const r = await api.post(`/api/uniforms/issuances/${id}/counter-sign`, data);
    return r.data;
  },
  async cancelIssuance(id: string) {
    const r = await api.post(`/api/uniforms/issuances/${id}/cancel`);
    return r.data;
  },
  async closeTermination(id: string) {
    const r = await api.post(`/api/uniforms/issuances/${id}/close-termination`);
    return r.data;
  },
  async issuancePdfUrl(id: string) {
    const r = await api.get(`/api/uniforms/issuances/${id}/pdf`);
    return r.data as { data: { url: string } };
  },

  // Retours
  async getHoldings(employeeId: string) {
    const r = await api.get(`/api/uniforms/employees/${employeeId}/holdings`);
    return r.data as { data: Holding[] };
  },
  async createReturn(data: { issuanceId: string; lines: ReturnLineInput[]; notes?: string }) {
    const r = await api.post('/api/uniforms/returns', data);
    return r.data as { data: UniformReturn };
  },
  async getReturn(id: string) {
    const r = await api.get(`/api/uniforms/returns/${id}`);
    return r.data as { data: UniformReturn };
  },
  async finalizeReturn(id: string) {
    const r = await api.post(`/api/uniforms/returns/${id}/finalize`);
    return r.data;
  },
  async sendReturnSms(id: string) {
    const r = await api.post(`/api/uniforms/returns/${id}/send-sms`);
    return r.data;
  },
  async counterSignReturn(id: string, data: { employeeSignatureBase64?: string; employerSignatureBase64?: string; signedByName?: string }) {
    const r = await api.post(`/api/uniforms/returns/${id}/counter-sign`, data);
    return r.data;
  },
  async returnPdfUrl(id: string) {
    const r = await api.get(`/api/uniforms/returns/${id}/pdf`);
    return r.data as { data: { url: string } };
  },

  // Fiche & règlements
  async getFiche(employeeId: string) {
    const r = await api.get(`/api/uniforms/employees/${employeeId}/fiche`);
    return r.data as { data: { employee: any; holdings: Holding[]; owed: AmountOwed; issuances: UniformIssuance[]; returns: UniformReturn[]; settlements: any[] } };
  },
  async createSettlement(employeeId: string, data: { amount: number; method?: string; notes?: string }) {
    const r = await api.post(`/api/uniforms/employees/${employeeId}/settlements`, data);
    return r.data;
  },

  // Rapports
  async reportStock() {
    const r = await api.get('/api/uniforms/reports/stock');
    return r.data as { data: { rows: any[]; totals: { totalUnits: number; totalValue: number } } };
  },
  async reportOverdue() {
    const r = await api.get('/api/uniforms/reports/overdue');
    return r.data as { data: any[] };
  },
  async reportLosses() {
    const r = await api.get('/api/uniforms/reports/losses');
    return r.data as { data: { rows: any[]; totals: { totalCost: number; totalUnits: number } } };
  },
  async statsSummary() {
    const r = await api.get('/api/uniforms/stats/summary');
    return r.data as { data: any };
  },
  async exportInventoryXlsx(): Promise<Blob> {
    const r = await api.get('/api/uniforms/inventory/export', { responseType: 'blob' });
    return r.data as Blob;
  },
};
