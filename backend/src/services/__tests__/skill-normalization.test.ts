import { normalizeSkillName, dedupeSkillsByName } from '../../utils/skill-normalization';

describe('skill-normalization utilities', () => {
  it('maps common synonyms and typos to canonical form', () => {
    expect(normalizeSkillName('MS Excel')).toBe('microsoft excel');
    expect(normalizeSkillName('Excel avance')).toBe('microsoft excel');
    expect(normalizeSkillName('javascrpit')).toBe('javascript');
    expect(normalizeSkillName('Bureau de la securite privee')).toBe('bsp');
  });

  it('dedupes skills while keeping the highest confidence entry', () => {
    const deduped = dedupeSkillsByName([
      { skillName: 'Excel', confidence: 0.6 },
      { skillName: 'Microsoft Excel', confidence: 0.9 },
      { skillName: 'BSP', confidence: 0.8 },
      { skillName: 'bureau de la securite privee', confidence: 0.7 },
    ]);

    expect(deduped).toHaveLength(2);
    const excel = deduped.find((s) => normalizeSkillName(s.skillName) === 'microsoft excel');
    const bsp = deduped.find((s) => normalizeSkillName(s.skillName) === 'bsp');
    expect(excel?.confidence).toBe(0.9);
    expect(bsp?.confidence).toBe(0.8);
  });
});
