import axios from 'axios';
import type { SignPayload } from '@/types/uniform';

// Instance NON authentifiée pour la page publique de signature (lien SMS).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const publicApi = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

export const publicUniformService = {
  async getSignPayload(token: string) {
    const r = await publicApi.get(`/api/uniforms/sign/${token}`);
    return r.data as { data: SignPayload };
  },
  async submitSignature(
    token: string,
    data: { signatureBase64: string; signedByName: string; consents?: { payroll?: boolean; policy?: boolean; fit?: boolean } }
  ) {
    const r = await publicApi.post(`/api/uniforms/sign/${token}`, data);
    return r.data as { message: string; pdfUrl?: string | null };
  },
};
