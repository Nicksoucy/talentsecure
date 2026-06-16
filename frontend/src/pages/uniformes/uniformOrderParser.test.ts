import { describe, it, expect } from 'vitest';
import { parseUniformOrder, normalizeSize, matchItem } from './uniformOrderParser';

const SAMPLE = `Nom de l'employé : Wanko NGOUCHINGHE GEORGINIO
Courriel ; wankongouchinghegeorginio@gmail.com
Numéro de telephone ; (579) 369-9345
Division (sécurité ou signalisation) : Sécurité
Date et heure de la collecte : 5053 TERRASSE DUVERNAY, SOREL-TRACY, en courrier recommandé
Uniforme requis et grandeur :
Chemise à manches longue (1): XLarge
Chemise à manches courtes (1):  XLarge
Pantalon cargo (1): XLarge
Ceinture (1): XLarge
Manteau (0) : Pas de manteau
Autre (exemple: chapeau, dossard, etc): dossard de sécurité ; lunettes de sécurité ; casque de sécurité`;

describe('parseUniformOrder', () => {
  const p = parseUniformOrder(SAMPLE);

  it('extrait le nom (prénom + nom)', () => {
    expect(p.firstName).toBe('Wanko');
    expect(p.lastName).toBe('NGOUCHINGHE GEORGINIO');
  });

  it('extrait courriel et téléphone (séparateur ;)', () => {
    expect(p.email).toBe('wankongouchinghegeorginio@gmail.com');
    expect(p.phone).toBe('(579) 369-9345');
  });

  it('mappe la division', () => {
    expect(p.division).toBe('SECURITE');
  });

  it('met la collecte dans les notes', () => {
    expect(p.collecte).toContain('SOREL-TRACY');
  });

  it('extrait les lignes qté > 0 et ignore Manteau (0)', () => {
    expect(p.lines).toHaveLength(4);
    expect(p.lines.map((l) => l.raw)).toEqual([
      'Chemise à manches longue',
      'Chemise à manches courtes',
      'Pantalon cargo',
      'Ceinture',
    ]);
    expect(p.lines.every((l) => l.qty === 1)).toBe(true);
    expect(p.lines.every((l) => l.rawSize === 'XLarge')).toBe(true);
  });

  it('parse « Autre » sans se faire piéger par le « : » dans les parenthèses', () => {
    expect(p.others).toEqual([
      'dossard de sécurité',
      'lunettes de sécurité',
      'casque de sécurité',
    ]);
  });
});

describe('normalizeSize', () => {
  it('mappe les libellés longs vers les tailles du catalogue', () => {
    expect(normalizeSize('XLarge')).toBe('XL');
    expect(normalizeSize('Large')).toBe('L');
    expect(normalizeSize('Medium')).toBe('M');
    expect(normalizeSize('2XLarge')).toBe('2XL');
    expect(normalizeSize('34')).toBe('34');
  });
});

// Mini-catalogue Sécurité (mêmes noms que le seed réel).
const CATALOGUE = [
  { id: 'c_gris_mc', name: 'Chemise grise (MC)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'c_gris_ml', name: 'Chemise grise (ML)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'c_blanc_mc', name: 'Chemise blanche (MC)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'c_blanc_ml', name: 'Chemise blanche (ML)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'p_mil', name: 'Pantalon noir (militaire)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'p_comp', name: 'Pantalon noir (complet)', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'ceinture', name: 'Ceinture', type: 'UNIFORME', isOneSize: false, variants: [] },
  { id: 'dossard', name: 'Dossard de sécurité', type: 'EQUIPEMENT', isOneSize: true, variants: [] },
  { id: 'lunette', name: 'Lunette de sécurité', type: 'EQUIPEMENT', isOneSize: true, variants: [] },
] as any;

describe('matchItem — assume les pièces standard de Sécurité', () => {
  const id = (raw: string) => matchItem(raw, CATALOGUE).item?.id ?? null;

  it('chemise manches longue → grise (ML), pas blanche', () => {
    expect(id('Chemise à manches longue')).toBe('c_gris_ml');
  });
  it('chemise manches courtes → grise (MC)', () => {
    expect(id('Chemise à manches courtes')).toBe('c_gris_mc');
  });
  it('pantalon cargo → noir militaire (défaut), pas complet', () => {
    expect(id('Pantalon cargo')).toBe('p_mil');
  });
  it('ceinture → ceinture, dossard → dossard, lunettes → lunette', () => {
    expect(id('Ceinture')).toBe('ceinture');
    expect(id('dossard de sécurité')).toBe('dossard');
    expect(id('lunettes de sécurité')).toBe('lunette');
  });
  it('article hors catalogue (casque en Signalisation) → non matché', () => {
    expect(id('casque de sécurité')).toBeNull();
  });
});
