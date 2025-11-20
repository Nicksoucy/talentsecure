import { CVExtractionService } from '../cv-extraction.service';

describe('CVExtractionService pattern matching', () => {
  const service = new CVExtractionService();

  const callExtractPatternMatches = (text: string) => {
    return (service as any).extractPatternMatches(text);
  };

  it('detects Quebec certifications and driver licenses', () => {
    const matches = callExtractPatternMatches('Permis classe 4B, formation RCR et BSP valide.');
    const names = matches.map((m: any) => m.skillName);
    expect(names).toEqual(expect.arrayContaining(['Permis classe 4B', 'RCR', 'BSP']));
  });

  it('detects software and security tools', () => {
    const matches = callExtractPatternMatches('Maîtrise de Microsoft Excel, SAP et surveillance CCTV.');
    const names = matches.map((m: any) => m.skillName);
    expect(names).toEqual(expect.arrayContaining(['Microsoft Excel', 'SAP', 'CCTV']));
  });
});
