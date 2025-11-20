import { AIExtractionService } from '../ai-extraction.service';

const mockSkills = [
  { id: '1', name: 'Microsoft Excel', keywords: ['excel', 'ms excel'], category: 'BUREAU', isSecurityRelated: false },
  { id: '2', name: 'BSP', keywords: ['bureau de la securite privee'], category: 'SECURITE', isSecurityRelated: true },
] as any;

describe('AIExtractionService matching', () => {
  const service = new AIExtractionService();

  it('normalizes AI skill names before matching', async () => {
    const aiSkills = [
      { name: 'ms excel', confidence: 0.9 },
      { name: 'Bureau de la securite privee', confidence: 0.8 },
    ];

    const matched = await (service as any).matchAISkillsWithDatabase(aiSkills, mockSkills);

    const skillNames = matched.map((s: any) => s.skillName);
    expect(skillNames).toEqual(expect.arrayContaining(['Microsoft Excel', 'BSP']));
  });
});
