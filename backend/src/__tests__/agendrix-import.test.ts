import {
  cleanNameTags,
  computeEmployeeUpdate,
  EmployeeSnapshot,
  normalizeAgendrixRow,
  parseAgendrixAddress,
  parseMatriculePrefix,
  AgendrixRow,
} from '../utils/agendrixImport';

/**
 * Helpers PURS de l'import Agendrix (aucune DB, aucun réseau).
 * Les adresses testées sont des variantes RÉELLES observées dans l'export
 * « Agendrix - employés » (346 lignes mesurées avant l'implémentation).
 */
describe('agendrixImport — parseAgendrixAddress', () => {
  it('adresse complète « rue, ville, QC CP »', () => {
    expect(parseAgendrixAddress('2675 Bd Pie-IX, Montréal, QC H1V 2E8')).toEqual({
      address: '2675 Bd Pie-IX',
      city: 'Montréal',
      province: 'QC',
      postalCode: 'H1V 2E8',
    });
  });

  it('province collée à la ville + suffixe « , Canada »', () => {
    expect(parseAgendrixAddress('4710 Boul Décarie, Montréal QC H3X 2H5, Canada')).toEqual({
      address: '4710 Boul Décarie',
      city: 'Montréal',
      province: 'QC',
      postalCode: 'H3X 2H5',
    });
  });

  it('sans ville ni code postal (appartement en fin) → city null, adresse intacte', () => {
    expect(parseAgendrixAddress('101 place Charles le Moyne Appartement 822')).toEqual({
      address: '101 place Charles le Moyne Appartement 822',
      city: null,
      province: 'QC',
      postalCode: null,
    });
  });

  it('virgules collées et QC isolé « 5-1655,Rue Mullins, Montréal,QC »', () => {
    expect(parseAgendrixAddress('5-1655,Rue Mullins, Montréal,QC')).toEqual({
      address: '5-1655, Rue Mullins',
      city: 'Montréal',
      province: 'QC',
      postalCode: null,
    });
  });

  it('SANS virgules : ville reconnue en fin de chaîne (« … Montréal Nord Québec »)', () => {
    expect(parseAgendrixAddress('4050 Rue prieur Est Montréal Nord Québec')).toEqual({
      address: '4050 Rue prieur Est',
      city: 'Montréal-Nord',
      province: 'QC',
      postalCode: null,
    });
  });

  it('minuscules + apostrophe courbe (« 350 rue evangeline l’assomption »)', () => {
    expect(parseAgendrixAddress('350 rue evangeline l’assomption')).toEqual({
      address: '350 rue evangeline',
      city: "L'Assomption",
      province: 'QC',
      postalCode: null,
    });
  });

  it('numéro d’unité « # 609 » en fin → pas pris pour une ville', () => {
    expect(parseAgendrixAddress('1595 Boulevard Henri-Bourassa Ouest  # 609')).toEqual({
      address: '1595 Boulevard Henri-Bourassa Ouest # 609',
      city: null,
      province: 'QC',
      postalCode: null,
    });
  });

  it('code postal hors Québec → province déduite du préfixe (ON)', () => {
    expect(parseAgendrixAddress('123 Rue A, Ottawa K1A0B1')).toEqual({
      address: '123 Rue A',
      city: 'Ottawa',
      province: 'ON',
      postalCode: 'K1A 0B1',
    });
  });

  it('vide / null → tout null, province QC par défaut', () => {
    expect(parseAgendrixAddress('')).toEqual({ address: null, city: null, province: 'QC', postalCode: null });
    expect(parseAgendrixAddress(null)).toEqual({ address: null, city: null, province: 'QC', postalCode: null });
  });
});

describe('agendrixImport — cleanNameTags / parseMatriculePrefix', () => {
  it('retire les tags « (EE) », « (PSB) », « (vaccinée) » (26 cas dans le fichier)', () => {
    expect(cleanNameTags('Bah (EE)')).toEqual({ name: 'Bah', tags: ['EE'] });
    expect(cleanNameTags('Roy (vaccinée)')).toEqual({ name: 'Roy', tags: ['vaccinée'] });
    expect(cleanNameTags('(PSB) Diallo (EE)')).toEqual({ name: 'Diallo', tags: ['PSB', 'EE'] });
    expect(cleanNameTags('Sokhna')).toEqual({ name: 'Sokhna', tags: [] });
    expect(cleanNameTags(null)).toEqual({ name: '', tags: [] });
  });

  it('matricule préfixé au prénom (défensif — 0 cas dans cet export)', () => {
    expect(parseMatriculePrefix('3221-Yvan')).toEqual({ firstName: 'Yvan', matricule: '3221' });
    expect(parseMatriculePrefix('4099 - SOUKAINA')).toEqual({ firstName: 'SOUKAINA', matricule: '4099' });
    expect(parseMatriculePrefix('Marie')).toEqual({ firstName: 'Marie', matricule: null });
  });
});

describe('agendrixImport — normalizeAgendrixRow', () => {
  const cells = (over: Partial<Record<number, string>> = {}) => {
    const base = [
      'Abderraouf', 'Kadem', '2675 Bd Pie-IX, Montréal, QC H1V 2E8',
      'KademRaouf@Gmail.com', '263-288-1212', 'Mobile', ' ', ' ', ' ', ' ',
    ];
    return base.map((v, i) => over[i] ?? v);
  };

  it('ligne standard : courriel en minuscules, téléphone Mobile, adresse parsée', () => {
    const row = normalizeAgendrixRow(cells(), 2) as AgendrixRow;
    expect(row.firstName).toBe('Abderraouf');
    expect(row.email).toBe('kademraouf@gmail.com');
    expect(row.phones).toEqual(['263-288-1212']);
    expect(row.primaryPhone).toBe('263-288-1212');
    expect(row.parsed.city).toBe('Montréal');
  });

  it('comptes département « XGuard » ignorés (4 dans le fichier)', () => {
    expect(normalizeAgendrixRow(cells({ 0: 'Comptabilité', 1: 'Xguard' }), 69)).toEqual({
      skipped: 'compte département (Comptabilité Xguard)',
    });
  });

  it('ligne vide → skipped', () => {
    expect(normalizeAgendrixRow(Array(10).fill(''), 5)).toEqual({ skipped: 'ligne vide' });
  });

  it('téléphones : « Mobile » prioritaire, cellules « " " » ignorées, doublons dédupliqués', () => {
    const row = normalizeAgendrixRow(
      cells({ 4: '514-555-0001', 5: 'Maison', 6: '4385551234', 7: 'Mobile', 8: '(438) 555-1234', 9: 'Travail' }),
      3
    ) as AgendrixRow;
    // Mobile d'abord ; le 3e (mêmes 10 chiffres que le 2e) est dédupliqué.
    expect(row.primaryPhone).toBe('4385551234');
    expect(row.phones).toEqual(['4385551234', '514-555-0001']);
  });

  it('tags des noms extraits et retirés', () => {
    const row = normalizeAgendrixRow(cells({ 1: 'Bah (EE)' }), 4) as AgendrixRow;
    expect(row.lastName).toBe('Bah');
    expect(row.tags).toEqual(['EE']);
  });
});

describe('agendrixImport — computeEmployeeUpdate (politique de fusion)', () => {
  const emp = (over: Partial<EmployeeSnapshot> = {}): EmployeeSnapshot => ({
    id: 'e1',
    firstName: 'Abderraouf',
    lastName: 'Kadem',
    email: 'kademraouf@gmail.com',
    phone: '263-288-1212',
    address: null,
    city: 'Montréal',
    province: 'QC',
    postalCode: null,
    status: 'ACTIF',
    employeeNumber: null,
    ...over,
  });
  const rowFor = (over: Partial<Record<number, string>> = {}): AgendrixRow => {
    const base = [
      'Abderraouf', 'Kadem', '2675 Bd Pie-IX, Montréal, QC H1V 2E8',
      'kademraouf@gmail.com', '263-288-1212', 'Mobile', ' ', ' ', ' ', ' ',
    ];
    return normalizeAgendrixRow(base.map((v, i) => over[i] ?? v), 2) as AgendrixRow;
  };

  it("l'adresse Agendrix fait foi : rue + code postal écrits, addressChanged", () => {
    const plan = computeEmployeeUpdate(emp(), rowFor())!;
    expect(plan.data).toMatchObject({ address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' });
    expect(plan.addressChanged).toBe(true);
    // Ville identique (Montréal) → pas réécrite.
    expect(plan.data.city).toBeUndefined();
  });

  it('ligne SANS adresse → champs adresse DB intacts (pas de blanking)', () => {
    const plan = computeEmployeeUpdate(
      emp({ address: '999 Rue Connue', postalCode: 'H2X 1Y4' }),
      rowFor({ 2: '' })
    );
    expect(plan).toBeNull(); // rien d'autre ne change
  });

  it('idempotence : mêmes valeurs → null (aucune écriture)', () => {
    const plan = computeEmployeeUpdate(
      emp({ address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    );
    expect(plan).toBeNull();
  });

  it('courriel : rempli si absent, comparé insensible à la casse', () => {
    const filled = computeEmployeeUpdate(emp({ email: null, address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }), rowFor())!;
    expect(filled.data.email).toBe('kademraouf@gmail.com');
    const same = computeEmployeeUpdate(
      emp({ email: 'KademRaouf@GMAIL.com', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    );
    expect(same).toBeNull();
  });

  it('téléphone : conservé si mêmes 10 chiffres (format DB gardé), remplacé sinon, rempli si vide', () => {
    const sameDigits = computeEmployeeUpdate(
      emp({ phone: '(263) 288-1212', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    );
    expect(sameDigits).toBeNull();
    const different = computeEmployeeUpdate(
      emp({ phone: '514-000-0000', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    )!;
    expect(different.data.phone).toBe('263-288-1212');
    const empty = computeEmployeeUpdate(
      emp({ phone: '', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    )!;
    expect(empty.data.phone).toBe('263-288-1212');
  });

  it('matricule : fill-only ; divergence signalée sans écriture', () => {
    const fill = computeEmployeeUpdate(
      emp({ address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor({ 0: '3221-Abderraouf' })
    )!;
    expect(fill.data.employeeNumber).toBe('3221');
    const mismatch = computeEmployeeUpdate(
      emp({ employeeNumber: '9999', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor({ 0: '3221-Abderraouf' })
    )!;
    expect(mismatch.data.employeeNumber).toBeUndefined();
    expect(mismatch.warnings.some((w) => w.includes('3221') && w.includes('9999'))).toBe(true);
  });

  it('noms : un tag encore présent en DB est retiré ; divergence réelle signalée sans écriture', () => {
    const tagInDb = computeEmployeeUpdate(
      emp({ lastName: 'Kadem (EE)', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    )!;
    expect(tagInDb.data.lastName).toBe('Kadem');
    const divergent = computeEmployeeUpdate(
      emp({ lastName: 'Autre-Nom', address: '2675 Bd Pie-IX', postalCode: 'H1V 2E8' }),
      rowFor()
    )!;
    expect(divergent.data.lastName).toBeUndefined();
    expect(divergent.warnings.some((w) => w.includes('Autre-Nom'))).toBe(true);
  });
});
