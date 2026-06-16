import { describe, it, expect } from 'vitest';
import { parseUniformOrder, normalizeSize } from './uniformOrderParser';

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
