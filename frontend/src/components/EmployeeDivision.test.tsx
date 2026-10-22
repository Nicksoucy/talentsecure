import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '@/test/renderWithProviders';
import {
  DivisionChips,
  DivisionSelect,
  choiceFromDivisions,
  divisionsFromChoice,
  isFlaggerOnly,
  type DivisionChoice,
} from './EmployeeDivision';

describe('EmployeeDivision — conversions', () => {
  it('liste de métiers → choix (absent = agent de sécurité)', () => {
    expect(choiceFromDivisions(undefined)).toBe('SECURITE');
    expect(choiceFromDivisions([])).toBe('SECURITE');
    expect(choiceFromDivisions(['SIGNALISATION'])).toBe('SIGNALISATION');
    expect(choiceFromDivisions(['SECURITE', 'SIGNALISATION'])).toBe('LES_DEUX');
  });

  it('choix → liste envoyée à l’API', () => {
    expect(divisionsFromChoice('SECURITE')).toEqual(['SECURITE']);
    expect(divisionsFromChoice('SIGNALISATION')).toEqual(['SIGNALISATION']);
    expect(divisionsFromChoice('LES_DEUX')).toEqual(['SECURITE', 'SIGNALISATION']);
  });

  it('signaleur seulement', () => {
    expect(isFlaggerOnly(['SIGNALISATION'])).toBe(true);
    expect(isFlaggerOnly(['SECURITE', 'SIGNALISATION'])).toBe(false);
    expect(isFlaggerOnly(undefined)).toBe(false);
  });
});

describe('DivisionChips', () => {
  it('signaleur : une seule pastille « Signaleur »', () => {
    renderWithProviders(<DivisionChips divisions={['SIGNALISATION']} />);
    expect(screen.getByText('Signaleur')).toBeInTheDocument();
    expect(screen.queryByText('Agent de sécurité')).not.toBeInTheDocument();
  });

  it('les deux métiers : deux pastilles', () => {
    renderWithProviders(<DivisionChips divisions={['SECURITE', 'SIGNALISATION']} />);
    expect(screen.getByText('Signaleur')).toBeInTheDocument();
    expect(screen.getByText('Agent de sécurité')).toBeInTheDocument();
  });
});

describe('DivisionSelect', () => {
  it('propose les 3 choix et remonte la sélection', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [v, setV] = useState<DivisionChoice>('SECURITE');
      return <DivisionSelect value={v} onChange={(c) => { setV(c); onChange(c); }} />;
    }
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Métier' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Agent de sécurité',
      'Signaleur',
      'Agent de sécurité et signaleur',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Signaleur' }));
    expect(onChange).toHaveBeenCalledWith('SIGNALISATION');
  });
});
