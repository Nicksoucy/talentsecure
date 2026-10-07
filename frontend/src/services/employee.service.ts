import api from './api';
import { Employee } from '@/types';
import type { Holding } from '@/types/uniform';

/** Avertissement non bloquant renvoyé quand un employé passe INACTIF en
 *  détenant encore des uniformes (offboarding). */
export interface UniformOffboardingWarning {
  totalPieces: number;
  owed: number;
  holdings: Holding[];
  activeIssuanceIds: string[];
  deadline: string | null;
}

export interface UpdateEmployeeResponse {
  data: Employee;
  message: string;
  uniformWarning?: UniformOffboardingWarning;
}

// ---------------------------------------------------------------------------
// Fermeture de dossier (lettre par courriel CC paie + RH, texto, date limite)
// ---------------------------------------------------------------------------
export type ClosureReason = 'INACTIVITE' | 'DEMISSION' | 'FIN_EMPLOI';
export type ChannelStatus = 'SENT' | 'FAILED' | 'SKIPPED';
export type ClosureTrackingStatus = 'EN_ATTENTE' | 'RAPPORTE' | 'TRANSMIS_PAIE' | 'AUCUN_UNIFORME';

export interface ClosureEstimate {
  pieces: Array<{ itemName: string; size: string; quantity: number; unitCost: number; lineTotal: number }>;
  totalPieces: number;
  total: number;
  issuancesWithoutLines: number;
}

export interface ClosureNotice {
  id: string;
  sentAt: string;
  sentByName: string | null;
  reason: ClosureReason;
  returnDeadlineAt: string;
  emailTo: string | null;
  emailCc: string[];
  emailStatus: ChannelStatus;
  emailError: string | null;
  smsTo: string | null;
  smsStatus: ChannelStatus;
  smsError: string | null;
  estimatedAmount: number;
}

export interface ClosureOverview {
  employee: { id: string; firstName: string; lastName: string; email: string | null; phone: string; status: 'ACTIF' | 'INACTIF' };
  defaults: {
    deadline: string;
    reasonTexts: Record<ClosureReason, string>;
    reasonLabels: Record<ClosureReason, string>;
    cc: string[];
    subject: string;
  };
  estimate: ClosureEstimate;
  notices: ClosureNotice[];
  tracking: { status: ClosureTrackingStatus; daysLeft: number | null; owed: number } | null;
}

export interface ClosureInput {
  reason: ClosureReason;
  reasonText: string;
  deadline: string;
  sendSms: boolean;
}

/** Fermer le dossier sans rien envoyer. */
export interface SilentClosureInput {
  reason: ClosureReason;
  /** Seulement si l'employé détient encore des pièces. */
  deadline?: string;
}

export interface ClosurePreview {
  subject: string;
  to: string | null;
  cc: string[];
  html: string;
  sms: string;
  estimate: ClosureEstimate;
}

interface GetEmployeesParams {
  search?: string;
  status?: 'ACTIF' | 'INACTIF';
  city?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Recherche par rayon autour d'un point (carte) → nearLat/nearLng/nearRadiusKm. */
  near?: { lat: number; lng: number; radiusKm: number } | null;
}

interface EmployeesResponse {
  data: Employee[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** Une ligne du registre d'un dossier employé (qui a fait quoi, quand). */
export interface EmployeeHistoryEntry {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  details: string | null;
  /** Nom de la personne, ou « Système » (clôture automatique, import). */
  by: string;
}

export const employeeService = {
  async getEmployees(params?: GetEmployeesParams): Promise<EmployeesResponse> {
    // `near` (point + rayon) → nearLat/nearLng/nearRadiusKm pour l'API.
    const { near, ...rest } = params || {};
    const query: Record<string, unknown> = { ...rest };
    if (near) {
      query.nearLat = near.lat;
      query.nearLng = near.lng;
      query.nearRadiusKm = near.radiusKm;
    }
    const response = await api.get('/api/employees', { params: query });
    return response.data;
  },

  async getEmployeeById(id: string): Promise<{ data: Employee }> {
    const response = await api.get(`/api/employees/${id}`);
    return response.data;
  },

  async getEmployeesStats(): Promise<{
    data: { total: number; actifs: number; inactifs: number };
  }> {
    const response = await api.get('/api/employees/stats/summary');
    return response.data;
  },

  async createEmployee(data: Partial<Employee>): Promise<{ data: Employee; message: string }> {
    const response = await api.post('/api/employees', data);
    return response.data;
  },

  async updateEmployee(id: string, data: Partial<Employee>): Promise<UpdateEmployeeResponse> {
    const response = await api.put(`/api/employees/${id}`, data);
    return response.data;
  },

  async deleteEmployee(id: string): Promise<{ message: string }> {
    const response = await api.delete(`/api/employees/${id}`);
    return response.data;
  },

  /**
   * Promouvoir un candidat en employé.
   */
  async promoteCandidate(
    candidateId: string,
    data: { hireDate?: string; position?: string; assignment?: string; employeeNumber?: string }
  ): Promise<{ data: Employee; message: string }> {
    const response = await api.post(`/api/employees/promote/${candidateId}`, data);
    return response.data;
  },

  /**
   * Promouvoir un candidat potentiel (prospect) directement en employé.
   */
  async promoteProspect(
    prospectId: string,
    data: { hireDate?: string; position?: string; assignment?: string; employeeNumber?: string } = {}
  ): Promise<{ data: Employee; message: string }> {
    const response = await api.post(`/api/employees/promote-prospect/${prospectId}`, data);
    return response.data;
  },

  async getHistory(id: string): Promise<EmployeeHistoryEntry[]> {
    const response = await api.get(`/api/employees/${id}/history`);
    return response.data.data;
  },

  async getClosure(id: string): Promise<ClosureOverview> {
    const response = await api.get(`/api/employees/${id}/closure`);
    return response.data.data;
  },

  async previewClosure(id: string, input: ClosureInput): Promise<ClosurePreview> {
    const response = await api.post(`/api/employees/${id}/closure/preview`, input);
    return response.data.data;
  },

  async closeSilently(id: string, input: SilentClosureInput): Promise<{ becameInactive: boolean; piecesHeld: number }> {
    const response = await api.post(`/api/employees/${id}/closure/silent`, input);
    return response.data.data;
  },

  async sendClosure(id: string, input: ClosureInput): Promise<ClosureNotice> {
    const response = await api.post(`/api/employees/${id}/closure`, input);
    return response.data.data;
  },

  async resendClosure(id: string, noticeId: string): Promise<ClosureNotice> {
    const response = await api.post(`/api/employees/${id}/closure/${noticeId}/resend`);
    return response.data.data;
  },
};
