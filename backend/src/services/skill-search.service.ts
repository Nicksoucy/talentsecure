import prisma from '../config/database';
import { SkillCategory } from '@prisma/client';

export interface ExtractedSkillsSearchFilters {
  searchTerm?: string;
  category?: SkillCategory | string;
  minConfidence?: number;
  limit?: number;
}

export interface ExtractedSkillsSearchResult {
  skillId: string;
  skillName: string;
  category: SkillCategory;
  description: string | null;
  keywords: string[];
  totalCandidates: number;
  candidates: Array<{
    candidateId: string;
    candidate: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      province: string | null;
      status: string | null;
      globalRating: number | null;
    } | null;
    level: string;
    yearsExperience: number | null;
    confidence: number | null;
    source: string;
    isVerified: boolean;
    extractedText: string | null;
  }>;
}

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const buildExtractedSkillsFilters = (
  query: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): ExtractedSkillsSearchFilters => {
  const { defaultLimit = 100, maxLimit = 1000 } = options;

  const pickup = (value: unknown): string | undefined => {
    if (Array.isArray(value)) {
      value = value[0];
    }
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const searchTerm = pickup(query.q);
  const category = pickup(query.category) as SkillCategory | undefined;
  const minConfidenceValue = pickup(query.minConfidence);
  const minConfidence = minConfidenceValue ? clampNumber(parseFloat(minConfidenceValue), 0, 1) : 0;
  const limitValue = pickup(query.limit);
  const parsedLimit = limitValue ? Math.floor(Number(limitValue)) : defaultLimit;

  return {
    searchTerm,
    category,
    minConfidence,
    limit: clampNumber(isNaN(parsedLimit) ? defaultLimit : parsedLimit, 1, maxLimit),
  };
};

export const fetchExtractedSkillsResults = async (
  filters: ExtractedSkillsSearchFilters
): Promise<{ results: ExtractedSkillsSearchResult[] }> => {
  const minConfidence = filters.minConfidence ?? 0;
  const limit = filters.limit ?? 100;

  const skillWhere: any = { isActive: true };
  if (filters.searchTerm) {
    skillWhere.OR = [
      { name: { contains: filters.searchTerm, mode: 'insensitive' } },
      { description: { contains: filters.searchTerm, mode: 'insensitive' } },
      { keywords: { has: filters.searchTerm.toLowerCase() } },
    ];
  }
  if (filters.category) {
    skillWhere.category = filters.category;
  }

  const skills = await prisma.skill.findMany({
    where: skillWhere,
    include: {
      candidateSkills: {
        where:
          minConfidence > 0
            ? {
                confidence: {
                  gte: minConfidence,
                },
              }
            : undefined,
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              city: true,
              province: true,
              status: true,
              globalRating: true,
            },
          },
        },
        orderBy: {
          confidence: 'desc',
        },
      },
      _count: { select: { candidateSkills: true } },
    },
    take: limit,
    orderBy: {
      candidateSkills: {
        _count: 'desc',
      },
    },
  });

  const results = skills.map((skill) => ({
    skillId: skill.id,
    skillName: skill.name,
    category: skill.category,
    description: skill.description,
    keywords: skill.keywords,
    totalCandidates: skill._count.candidateSkills,
    candidates: skill.candidateSkills.map((cs) => ({
      candidateId: cs.candidateId,
      candidate: cs.candidate,
      level: cs.level,
      yearsExperience: cs.yearsExperience,
      confidence: cs.confidence,
      source: cs.source,
      isVerified: cs.isVerified,
      extractedText: cs.extractedText,
    })),
  }));

  return { results };
};
