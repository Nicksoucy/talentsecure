import api from './api';

export interface ContractSummary {
  code: string;
  total: number;
  byType: Record<string, number>;
}

export const contractService = {
  /** Contrats ayant au moins un lead actif, avec les décomptes par section. */
  async getContracts(): Promise<ContractSummary[]> {
    const response = await api.get('/api/contracts');
    return response.data.data.contracts ?? [];
  },
};
