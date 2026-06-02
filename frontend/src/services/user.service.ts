import api from './api';
import type { User, UserRole } from '@/types';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const userService = {
  async listUsers(search?: string): Promise<{ data: User[] }> {
    const r = await api.get('/api/users', { params: search ? { search } : {} });
    return r.data;
  },
  async createUser(data: CreateUserInput): Promise<{ data: User }> {
    const r = await api.post('/api/users', data);
    return r.data;
  },
  async updateUser(id: string, data: UpdateUserInput): Promise<{ data: User }> {
    const r = await api.patch(`/api/users/${id}`, data);
    return r.data;
  },
  async resetPassword(id: string, password: string): Promise<{ message: string }> {
    const r = await api.post(`/api/users/${id}/reset-password`, { password });
    return r.data;
  },
};
