import api from './api';

export type AuditActionType =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT';

export interface DashboardActivity {
  id: string;
  action: AuditActionType;
  resource: string;
  resourceId: string | null;
  details: string | null;
  createdAt: string;
  user: { name: string };
}

export interface DashboardOverview {
  catalogues: { total: number; createdThisWeek: number };
  conversions: { total: number; convertedThisMonth: number };
  employees: { total: number; active: number };
  recentActivity: DashboardActivity[];
}

export const dashboardService = {
  /**
   * Vue d'ensemble du tableau de bord (catalogues, conversions, employés,
   * activité récente). Complète les stats candidats/prospects.
   */
  async getOverview(): Promise<{ success: boolean; data: DashboardOverview }> {
    const response = await api.get('/api/dashboard/overview');
    return response.data;
  },
};
