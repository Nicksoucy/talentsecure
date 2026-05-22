import api from './api';
import { Employee } from '@/types';

interface GetEmployeesParams {
  search?: string;
  status?: 'ACTIF' | 'INACTIF';
  city?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
    const response = await api.get('/api/employees', { params });
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

  async updateEmployee(id: string, data: Partial<Employee>): Promise<{ data: Employee; message: string }> {
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
};
