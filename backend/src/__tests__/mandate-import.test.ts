import {
  computeMandateUpdate,
  MandateSnapshot,
  normalizeMandateRow,
  MandateRow,
} from '../utils/mandateImport';

/**
 * Helpers PURS de l'import des mandats (aucune DB, aucun réseau). Chaînes tirées
 * de l'export réel « Agendrix - Ressources ».
 */
describe('mandateImport — normalizeMandateRow', () => {
  it('ligne standard : identifiant + nom + adresse parsée (Description ignorée)', () => {
    const r = normalizeMandateRow(
      ['333 Sherbrooke Est', 'GAR-001528', "333 Sherbrooke Est, Montreal' QC, H2X 4E3", 'MOT DE PASSE secret'],
      2
    ) as MandateRow;
    expect(r.externalId).toBe('GAR-001528');
    expect(r.name).toBe('333 Sherbrooke Est');
    expect(r.parsed).toEqual({ address: '333 Sherbrooke Est', city: 'Montréal', province: 'QC', postalCode: 'H2X 4E3' });
    expect(r.unplaceable).toBe(false);
    // Aucun champ ne doit contenir la description (secrets).
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('adresse « f » (modèle/test S00xxx) → non plaçable, adresse nullifiée', () => {
    const r = normalizeMandateRow(['S00147', 'S00147', 'f'], 5) as MandateRow;
    expect(r.unplaceable).toBe(true);
    expect(r.rawAddress).toBeNull();
    expect(r.parsed.address).toBeNull();
  });

  it('ligne vide → skipped', () => {
    expect(normalizeMandateRow(['', '', ''], 3)).toEqual({ skipped: 'ligne vide' });
  });

  it('sans identifiant unique → skipped', () => {
    expect(normalizeMandateRow(['Un nom', '', '123 rue X'], 4)).toEqual({
      skipped: 'sans identifiant unique (« Un nom »)',
    });
  });

  it('sans nom → skipped', () => {
    expect(normalizeMandateRow(['', 'GAR-001', '123 rue X'], 6)).toEqual({
      skipped: 'sans nom (GAR-001)',
    });
  });
});

describe('mandateImport — computeMandateUpdate', () => {
  const existing = (over: Partial<MandateSnapshot> = {}): MandateSnapshot => ({
    id: 'm1',
    externalId: 'GAR-001528',
    name: '333 Sherbrooke Est',
    address: '333 Sherbrooke Est',
    city: 'Montréal',
    province: 'QC',
    postalCode: 'H2X 4E3',
    ...over,
  });
  const row = (over: Partial<Record<number, string>> = {}): MandateRow => {
    const cells = ['333 Sherbrooke Est', 'GAR-001528', "333 Sherbrooke Est, Montreal' QC, H2X 4E3"];
    return normalizeMandateRow([over[0] ?? cells[0], cells[1], over[2] ?? cells[2]], 2) as MandateRow;
  };

  it('inchangé → null (idempotence)', () => {
    expect(computeMandateUpdate(existing(), row())).toBeNull();
  });

  it('nom changé → mise à jour du nom', () => {
    const plan = computeMandateUpdate(existing({ name: 'Ancien nom' }), row())!;
    expect(plan.data.name).toBe('333 Sherbrooke Est');
    expect(plan.addressChanged).toBe(false);
  });

  it('adresse changée → addressChanged + champs adresse écrits', () => {
    const plan = computeMandateUpdate(existing({ postalCode: null, address: null, city: null }), row())!;
    expect(plan.addressChanged).toBe(true);
    expect(plan.data).toMatchObject({ address: '333 Sherbrooke Est', city: 'Montréal', postalCode: 'H2X 4E3' });
  });
});
