// Le contrôleur batchExtractSkills a été refactoré : il délègue désormais à
// skillsService.batchProcessCandidates. On teste donc le contrôleur en mockant
// le service (la logique métier détaillée sera couverte à part, sur le service).
jest.mock('../services/skills.service', () => ({
  skillsService: {
    batchProcessCandidates: jest.fn(),
  },
}));

import { batchExtractSkills } from '../controllers/skills.controller';
import { skillsService } from '../services/skills.service';

const mockBatch = skillsService.batchProcessCandidates as unknown as jest.Mock;

describe('batchExtractSkills controller', () => {
  const createMockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn().mockImplementation((body) => body);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renvoie 400 si aucun candidat fourni', async () => {
    const req: any = { body: { candidateIds: [] } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockBatch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('délègue au service et mappe résultats + résumé dans la réponse', async () => {
    mockBatch.mockResolvedValueOnce({
      results: [
        { candidateId: 'cand-1', candidateName: 'Test User', skipped: true, skillsFound: 4, success: true },
      ],
      summary: { total: 1, success: 1, skipped: 1, processed: 0 },
    });

    const req: any = { body: { candidateIds: ['cand-1'], overwrite: false } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(mockBatch).toHaveBeenCalledWith(['cand-1'], { model: undefined, overwrite: false });
    expect(next).not.toHaveBeenCalled();

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
  });

  it('transmet le paramètre overwrite et le modèle au service', async () => {
    mockBatch.mockResolvedValueOnce({
      results: [],
      summary: { total: 0, success: 0, skipped: 0, processed: 0 },
    });

    const req: any = { body: { candidateIds: ['pros-1'], overwrite: true, model: 'haiku' } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(mockBatch).toHaveBeenCalledWith(['pros-1'], { model: 'haiku', overwrite: true });
  });

  it('propage les erreurs du service via next', async () => {
    mockBatch.mockRejectedValueOnce(new Error('boom'));

    const req: any = { body: { candidateIds: ['cand-1'] } };
    const res = createMockRes();
    const next = jest.fn();

    await batchExtractSkills(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
