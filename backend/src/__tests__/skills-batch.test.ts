jest.mock('@prisma/client', () => {
  const candidateFindUnique = jest.fn();
  const prospectFindUnique = jest.fn();
  const cvExtractionLogFindFirst = jest.fn();
  const cvExtractionLogCreate = jest.fn();

  return {
    PrismaClient: jest.fn(() => ({
      candidate: { findUnique: candidateFindUnique },
      prospectCandidate: { findUnique: prospectFindUnique },
      cvExtractionLog: {
        findFirst: cvExtractionLogFindFirst,
        create: cvExtractionLogCreate,
      },
    })),
    __mockCandidateFindUnique: candidateFindUnique,
    __mockProspectFindUnique: prospectFindUnique,
    __mockCvExtractionLogFindFirst: cvExtractionLogFindFirst,
    __mockCvExtractionLogCreate: cvExtractionLogCreate,
  };
});

jest.mock('../services/cv-extraction.service', () => ({
  cvExtractionService: {
    getCandidateText: jest.fn(),
    extractSkillsFromText: jest.fn(),
    saveExtractedSkills: jest.fn(),
  },
}));

jest.mock('../services/ai-extraction.service', () => ({
  aiExtractionService: {
    extractWithOpenAI: jest.fn(),
  },
}));

import { batchExtractSkills } from '../controllers/skills.controller';
import { cvExtractionService } from '../services/cv-extraction.service';

const {
  __mockCandidateFindUnique,
  __mockProspectFindUnique,
  __mockCvExtractionLogFindFirst,
} = jest.requireMock('@prisma/client');

const mockCvService = cvExtractionService as jest.Mocked<typeof cvExtractionService>;

describe('batchExtractSkills controller', () => {
  const createMockRes = () => {
    const res: any = {};
    res.json = jest.fn().mockImplementation((body) => body);
    return res;
  };

  beforeEach(() => {\r\n    jest.clearAllMocks();\r\n    __mockCandidateFindUnique.mockReset();\r\n    __mockProspectFindUnique.mockReset();\r\n    __mockCvExtractionLogFindFirst.mockReset();\r\n    mockCvService.getCandidateText.mockReset();\r\n    mockCvService.extractSkillsFromText.mockReset();\r\n    mockCvService.saveExtractedSkills.mockReset();\r\n  });

  it('marks previously processed candidates as skipped when overwrite is false', async () => {
    __mockCandidateFindUnique.mockResolvedValueOnce({
      id: 'cand-1',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
    });
    __mockProspectFindUnique.mockResolvedValueOnce(null);
    __mockCvExtractionLogFindFirst.mockResolvedValueOnce({
      id: 'log-1',
      skillsFound: 4,
      success: true,
    });

    const req: any = { body: { candidateIds: ['cand-1'], overwrite: false } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      candidateId: 'cand-1',
      candidateName: 'Test User',
      skipped: true,
      skillsFound: 4,
      success: true,
    });
    expect(payload.summary.skipped).toBe(1);
    expect(mockCvService.getCandidateText).not.toHaveBeenCalled();
  });

  it('processes prospects even if previous logs exist and returns their names', async () => {
    __mockCandidateFindUnique.mockResolvedValueOnce(null);
    __mockProspectFindUnique.mockResolvedValueOnce({
      id: 'pros-1',
      firstName: 'Prospect',
      lastName: 'User',
      email: 'prospect@example.com',
    });
    __mockCvExtractionLogFindFirst.mockResolvedValueOnce({
      id: 'log-2',
      skillsFound: 2,
      success: true,
    });

    mockCvService.getCandidateText.mockResolvedValueOnce('Long enough CV content for testing purposes.');
    mockCvService.extractSkillsFromText.mockResolvedValueOnce({
      candidateId: 'pros-1',
      success: true,
      totalSkills: 2,
      skillsFound: [
        { skillId: 'skill-1', skillName: 'Skill', confidence: 0.9, extractedText: 'text' },
        { skillId: 'skill-2', skillName: 'Skill2', confidence: 0.8, extractedText: 'text2' },
      ],
      processingTimeMs: 120,
      method: 'REGEX',
    });

    const req: any = { body: { candidateIds: ['pros-1'], overwrite: false } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.results).toHaveLength(1);
    const result = payload.results[0];
    expect(result.candidateId).toBe('pros-1');
    expect(result.candidateName).toBe('Prospect User');
    expect(result.skipped).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.isProspect).toBe(true);
    expect(mockCvService.saveExtractedSkills).not.toHaveBeenCalled();
    expect(mockCvService.extractSkillsFromText).toHaveBeenCalledWith('pros-1', expect.any(String));
  });
});

