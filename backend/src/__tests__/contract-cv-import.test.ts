import {
  batchKey,
  classifyCv,
  cleanAddressLine,
  collapseLetterSpacing,
  splitBlobUsingFileKey,
  extractEmail,
  extractPhone,
  extractPostalCode,
  extractStreetLine,
  fileNameKey,
  headerZone,
  isUnreadableCv,
  looksLikeNameLine,
  nameMatchScore,
  normalizeNameKey,
  parseCvContact,
  parseNameFromHeader,
  titleCaseName,
} from '../utils/contractCvImport';

/**
 * Helpers PURS de l'import de lots de CV — aucun accès DB/réseau.
 * Les cas de test sont calqués sur un lot réel de 148 CV Indeed.
 */

describe('normalisation', () => {
  it('normalizeNameKey retire accents, casse et ponctuation', () => {
    expect(normalizeNameKey('Amélise MATHIEU')).toBe('amelisemathieu');
    expect(normalizeNameKey("Jean-Yves O'Brien")).toBe('jeanyvesobrien');
  });

  it('titleCaseName respecte traits d\'union et apostrophes', () => {
    expect(titleCaseName('ABDOU AZIZ GUEYE')).toBe('Abdou Aziz Gueye');
    expect(titleCaseName('MARIE-LOU')).toBe('Marie-Lou');
    expect(titleCaseName("o'brien")).toBe("O'Brien");
  });

  it('fileNameKey retire extension, préfixe CV et suffixe de doublon', () => {
    expect(fileNameKey('CVDiederikAndrade.pdf')).toBe('diederikandrade');
    expect(fileNameKey('CVAméliseMATHIEU (1).pdf')).toBe('amelisemathieu');
    expect(fileNameKey('CVSAMYCHENAA.PDF')).toBe('samychenaa');
  });
});

describe('détection de ligne de nom', () => {
  it('accepte un nom, rejette chiffres, courriels et titres de section', () => {
    expect(looksLikeNameLine('ALIREZA GHANE')).toBe(true);
    expect(looksLikeNameLine('Marie-Lou Arseneau')).toBe(true);
    expect(looksLikeNameLine('514-714-4190')).toBe(false);
    expect(looksLikeNameLine('ezzineadam01@gmail.com')).toBe(false);
    // Sans liste de mots vides, ces lignes deviendraient des patronymes.
    expect(looksLikeNameLine('PROFIL PROFESSIONNEL')).toBe(false);
    expect(looksLikeNameLine('OBJECTIF PROFESSIONNEL')).toBe(false);
    expect(looksLikeNameLine('Je présente ma candidature')).toBe(false);
  });
});

describe('recoupement nom lu ↔ nom de fichier', () => {
  it('score 3 quand le nom est identique au fichier', () => {
    expect(nameMatchScore(['ALIREZA', 'GHANE'], 'alirezaghane')).toBe(3);
  });

  it('score 2 quand le fichier omet un deuxième prénom', () => {
    // CVAHMEDACHAB.pdf ↔ « AHMED YASSINE ACHAB »
    expect(nameMatchScore(['AHMED', 'YASSINE', 'ACHAB'], 'ahmedachab')).toBe(2);
  });

  it('score 0,5 quand la lecture est INCOMPLÈTE — il faut continuer à chercher', () => {
    // C'est ce qui empêche « MARIE-LOU » seul de l'emporter sur le nom complet.
    expect(nameMatchScore(['MARIE-LOU'], 'marielouarseneau')).toBe(0.5);
    expect(nameMatchScore(['MARIE-LOU', 'ARSENEAU'], 'marielouarseneau')).toBe(3);
  });
});

describe('PDF composés lettre par lettre', () => {
  it('recolle une ligne espacée caractère par caractère', () => {
    expect(collapseLetterSpacing('A B D O U A Z I Z G U E Y E')).toBe('ABDOUAZIZGUEYE');
    // Une vraie ligne de mots n'est pas touchée.
    expect(collapseLetterSpacing('ABDOU AZIZ GUEYE')).toBe('ABDOU AZIZ GUEYE');
    expect(collapseLetterSpacing('Montréal, QC')).toBe('Montréal, QC');
  });

  it('reconstruit la coupure prénom/nom à partir du nom de fichier', () => {
    // Le bloc porte un 2e prénom que le fichier omet : le début et la fin du
    // fichier bornent le prénom et le nom.
    expect(splitBlobUsingFileKey('ABDOUAZIZGUEYE', 'abdougueye')).toEqual(['ABDOUAZIZ', 'GUEYE']);
  });

  it('refuse de couper quand le fichier n\'explique pas le bloc', () => {
    // Bloc identique au fichier : aucune information sur où couper.
    expect(splitBlobUsingFileKey('FABRICETAMUKIUR', 'fabricetamukiur')).toBeNull();
    // Personne différente.
    expect(splitBlobUsingFileKey('JEANTREMBLAY', 'mariegagnon')).toBeNull();
  });

  it('bout en bout : un nom espacé situé bas dans le document est retrouvé', () => {
    // L'ordre de lecture d'un PDF multi-colonnes place parfois le nom après les
    // sections ; seule la concordance avec le fichier autorise à le retenir.
    const text = ['EXPÉRIENCES PROFESSIONNELLES', 'AGENT DE SÉCURITÉ', 'Français : Courant', 'A B D O U  A Z I Z  G U E Y E'].join('\n');
    const n = parseNameFromHeader(text, 'CVABDOUGUEYE.pdf')!;
    expect(n.lastName).toBe('Gueye');
    expect(n.confirmedByFileName).toBe(true);
  });
});

describe('extraction du nom', () => {
  it('lit un nom sur une ligne', () => {
    const n = parseNameFromHeader('ALIREZA GHANE\nChâteauguay, QC', 'CVAlirezaGhane.pdf')!;
    expect(n).toMatchObject({ firstName: 'Alireza', lastName: 'Ghane', confirmedByFileName: true });
  });

  it('recolle un nom réparti sur deux lignes', () => {
    const n = parseNameFromHeader('MARIE-LOU\nARSENEAU\nEXPÉRIENCES', 'CVMarielouArseneau.pdf')!;
    expect(n).toMatchObject({ firstName: 'Marie-Lou', lastName: 'Arseneau', confirmedByFileName: true });
  });

  it('recolle un nom réparti sur trois lignes', () => {
    const n = parseNameFromHeader('ACHELEY\nELEAZAR\nHENRY\nPROFIL', 'CVacheleyhenry.pdf')!;
    expect(n.confirmedByFileName).toBe(true);
    expect(n.lastName).toBe('Henry');
  });

  it('remet dans l\'ordre un CV écrit NOM puis Prénom', () => {
    // Le nom de fichier Indeed (prénom+nom) tranche l'ordre.
    const n = parseNameFromHeader('WILLIAMSON MICHEL\nAgent', 'CVMichelWilliamson.pdf')!;
    expect(n).toMatchObject({ firstName: 'Michel', lastName: 'Williamson', confirmedByFileName: true });
  });

  it('ignore un en-tête de section et va chercher le vrai nom plus bas', () => {
    const n = parseNameFromHeader('PROFIL PROFESSIONNEL\nAmélise Mathieu\n1865 Rue Bédard', 'CVAméliseMATHIEU (1).pdf')!;
    expect(n).toMatchObject({ firstName: 'Amélise', lastName: 'Mathieu', confirmedByFileName: true });
  });

  it('signale une lecture que le fichier ne confirme pas plutôt que de l\'affirmer', () => {
    const n = parseNameFromHeader('JUNIOR BIEN-AIMÉ\nAgent', 'CVROSELINEPIERRE-LOUIS.pdf')!;
    expect(n.confirmedByFileName).toBe(false);
  });

  it('renvoie null si aucun prénom+nom exploitable', () => {
    expect(parseNameFromHeader('PROFIL\nCOMPÉTENCES\n514-555-1234', 'CVX.pdf')).toBeNull();
  });
});

describe('zone d\'en-tête', () => {
  it('coupe au premier titre de section', () => {
    const zone = headerZone('JEAN TREMBLAY\n123 rue Papineau\nEXPÉRIENCE\n999 boul Employeur');
    expect(zone).toContain('123 rue Papineau');
    expect(zone).not.toContain('999 boul Employeur');
  });
});

describe('coordonnées', () => {
  it('extrait un courriel et rejette les domaines de service', () => {
    expect(extractEmail('Contact : samychenaa1@gmail.com')).toBe('samychenaa1@gmail.com');
    expect(extractEmail('profil linkedin: nom@linkedin.com')).toBeNull();
  });

  it('extrait un téléphone dans ses formats courants', () => {
    expect(extractPhone('514-714-4190')).toBe('514-714-4190');
    expect(extractPhone('(438) 555 1234')).toBe('438-555-1234');
    expect(extractPhone('+1 438 555 1234')).toBe('438-555-1234');
    // Gabarits et indicatifs impossibles.
    expect(extractPhone('0000000000')).toBeNull();
    expect(extractPhone('123-456-7890')).toBeNull();
  });

  it('extrait et normalise un code postal', () => {
    expect(extractPostalCode('Montréal H2X1Y4')).toBe('H2X 1Y4');
    expect(extractPostalCode('h4k 1n3')).toBe('H4K 1N3');
  });
});

describe('adresse', () => {
  it('nettoie puces, étiquettes et FSA orpheline', () => {
    expect(cleanAddressLine('■ 11716 Rue Prieur Est')).toBe('11716 Rue Prieur Est');
    expect(cleanAddressLine('Adresse : 1870 rue Dufresne')).toBe('1870 rue Dufresne');
    expect(cleanAddressLine('140 chemin du coteau rouge, J4J')).toBe('140 chemin du coteau rouge');
  });

  it('trouve une ligne de rue en FR comme en EN', () => {
    expect(extractStreetLine('Jean\n880, boul. Iberville\nRepentigny')).toBe('880, boul. Iberville');
    expect(extractStreetLine('John\n25 Main Street\nMontréal')).toBe('25 Main Street');
    expect(extractStreetLine('Aucune adresse ici')).toBeNull();
  });
});

describe('parseCvContact', () => {
  const CV = [
    'ALIREZA GHANE',
    '1860 Rue Sherbrooke Est, Montréal, QC H2K 1B5',
    '+1 (514) 652-7952 | alirezaghane50@gmail.com',
    '',
    'EXPÉRIENCE',
    'Agent de sécurité — 4000 boul. Employeur, Laval',
  ].join('\n');

  it('extrait nom, coordonnées et adresse de rue depuis l\'en-tête', () => {
    const p = parseCvContact(CV, 'CVAlirezaGhane.pdf')!;
    expect(p.firstName).toBe('Alireza');
    expect(p.lastName).toBe('Ghane');
    expect(p.email).toBe('alirezaghane50@gmail.com');
    expect(p.phone).toBe('514-652-7952');
    expect(p.phoneDigits).toBe('5146527952');
    expect(p.address).toContain('1860');
    expect(p.city).toBe('Montréal');
    expect(p.postalCode).toBe('H2K 1B5');
    expect(p.precision).toBe('street');
  });

  it('n\'utilise JAMAIS l\'adresse de la section Expérience (celle de l\'employeur)', () => {
    const p = parseCvContact(CV, 'CVAlirezaGhane.pdf')!;
    expect(p.address).not.toContain('Employeur');
    expect(p.address).not.toContain('4000');
  });

  it('signale une adresse trouvée hors en-tête sans l\'utiliser', () => {
    const noHeaderAddr = ['HUGO REYES', 'hugo@gmail.com', '', 'EXPÉRIENCE', '7058, Rue Employeur, Montréal'].join('\n');
    const p = parseCvContact(noHeaderAddr, 'CVHugoReyes.pdf')!;
    expect(p.address).toBeNull();
    expect(p.precision).toBe('none');
    expect(p.suspectStreetOutsideHeader).toContain('7058');
    expect(p.warnings.join(' ')).toContain('hors en-tête');
  });

  it('retombe sur le code postal puis sur la ville, sans jamais inventer', () => {
    const postalOnly = parseCvContact('JEAN TREMBLAY\nMontréal, QC H2X 1Y4\njean@gmail.com', 'CVJeanTremblay.pdf')!;
    expect(postalOnly.precision).toBe('postal');
    expect(postalOnly.address).toBeNull();

    const cityOnly = parseCvContact('JEAN TREMBLAY\nChâteauguay, QC\njean@gmail.com', 'CVJeanTremblay.pdf')!;
    expect(cityOnly.precision).toBe('city');
    expect(cityOnly.postalCode).toBeNull();

    const nothing = parseCvContact('JEAN TREMBLAY\njean@gmail.com\nAgent motivé et rigoureux.', 'CVJeanTremblay.pdf')!;
    expect(nothing.precision).toBe('none');
    expect(nothing.city).toBeNull();
  });

  it('ne recopie pas le corps du CV dans l\'objet extrait (PII)', () => {
    const withPii = [
      'JEAN TREMBLAY',
      'Montréal, QC',
      'jean@gmail.com',
      '',
      'PROFIL',
      'NAS 123 456 789, né le 1990-01-01, numéro de dossier confidentiel XYZ.',
    ].join('\n');
    const p = parseCvContact(withPii, 'CVJeanTremblay.pdf')!;
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('NAS');
    expect(serialized).not.toContain('123 456 789');
    expect(serialized).not.toContain('confidentiel');
  });

  it('isUnreadableCv repère un PDF scanné (texte quasi vide)', () => {
    expect(isUnreadableCv('   \n  ')).toBe(true);
    expect(isUnreadableCv('x'.repeat(250))).toBe(false);
  });
});

describe('décision d\'import', () => {
  const base = parseCvContact('JEAN TREMBLAY\nMontréal, QC\njean@gmail.com\n514-555-1234', 'CVJeanTremblay.pdf')!;
  const match = { section: 'employee', id: 'emp-1', firstName: 'Jean', lastName: 'Tremblay' };

  it('correspondance par courriel/téléphone → on TAGUE, jamais de doublon', () => {
    expect(classifyCv(base, match, null)).toMatchObject({ kind: 'tag-existing', section: 'employee', personId: 'emp-1' });
  });

  it('correspondance par NOM SEUL → ambigu, aucune écriture par défaut', () => {
    const d = classifyCv(base, null, match);
    expect(d.kind).toBe('ambiguous');
  });

  it('--name-match=tag et =create laissent l\'humain trancher', () => {
    expect(classifyCv(base, null, match, 'tag').kind).toBe('tag-existing');
    expect(classifyCv(base, null, match, 'create').kind).toBe('create');
  });

  it('aucune correspondance → création', () => {
    expect(classifyCv(base, null, null).kind).toBe('create');
  });

  it('sans courriel ni téléphone, le dédoublonnage est impossible → ambigu', () => {
    const anonymous = parseCvContact('JEAN TREMBLAY\nMontréal, QC\nAgent de sécurité motivé.', 'CVJeanTremblay.pdf')!;
    expect(classifyCv(anonymous, null, null).kind).toBe('ambiguous');
  });

  it('batchKey déduplique par courriel, puis téléphone, puis nom', () => {
    expect(batchKey(base)).toBe('e:jean@gmail.com');
  });
});
