import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/renderWithProviders';
import { employeeService } from '@/services/employee.service';
import EmployeeHistoryCard from './EmployeeHistoryCard';

vi.mock('@/services/employee.service', () => ({
  employeeService: { getHistory: vi.fn() },
}));
const getHistory = vi.mocked(employeeService.getHistory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmployeeHistoryCard', () => {
  it('liste les actions du registre, plus récentes d’abord, avec leur auteur', async () => {
    getHistory.mockResolvedValue([
      { id: 'b', createdAt: '2026-09-30T14:00:00.000Z', action: 'UPDATE', resource: 'Employee',
        details: 'Dossier fermé (Inactivité)', by: 'Tamara Hadid' },
      { id: 'a', createdAt: '2026-08-11T16:13:25.000Z', action: 'UPDATE', resource: 'Uniform',
        details: 'Uniformes clôturés automatiquement', by: 'Système' },
    ]);
    renderWithProviders(<EmployeeHistoryCard employeeId="emp-9" />);
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3); // en-tête + 2
    expect(rows[1]).toHaveTextContent('Dossier fermé (Inactivité)');
    expect(rows[1]).toHaveTextContent('Tamara Hadid');
    expect(rows[2]).toHaveTextContent('Système');
    expect(getHistory).toHaveBeenCalledWith('emp-9');
  });

  it('registre vide : message explicite', async () => {
    getHistory.mockResolvedValue([]);
    renderWithProviders(<EmployeeHistoryCard employeeId="emp-9" />);
    expect(await screen.findByText(/Aucune action inscrite au registre/)).toBeInTheDocument();
  });
});
