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
};
