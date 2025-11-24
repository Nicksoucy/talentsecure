import { useMemo } from 'react';

export interface SkillSearchResult {
    skillName: string;
    category?: string;
    candidates?: Array<{
        confidence?: number;
        level?: string;
    }>;
    totalCandidates?: number;
}

export interface AggregatedSkillStats {
    categoryCounts: Record<string, number>;
    levelCounts: Record<string, number>;
    totalCandidates: number;
    topConfidenceSkills: Array<{
        skill: string;
        avgConfidence: number;
        totalCandidates: number;
        category: string;
    }>;
}

/**
 * Hook to aggregate skill search results into useful statistics
 * @param searchResults - Array of skill search results to aggregate
 * @returns Aggregated statistics including category counts, level counts, and top skills
 */
export function useSkillsAggregation(searchResults: SkillSearchResult[]): AggregatedSkillStats {
    return useMemo(() => {
        const categoryCounts: Record<string, number> = {};
        const levelCounts: Record<string, number> = {};
        const confidenceSummary: Array<{
            skill: string;
            avgConfidence: number;
            totalCandidates: number;
            category: string;
        }> = [];

        if (searchResults.length === 0) {
            return {
                categoryCounts,
                levelCounts,
                totalCandidates: 0,
                topConfidenceSkills: confidenceSummary,
            };
        }

        searchResults.forEach((result) => {
            const candidates = result.candidates || [];
            const total = result.totalCandidates || candidates.length || 0;
            const category = result.category || 'Autres';
            categoryCounts[category] = (categoryCounts[category] || 0) + total;

            if (candidates.length > 0) {
                const avgConfidence =
                    candidates.reduce((sum, candidate) => sum + (candidate.confidence || 0), 0) / candidates.length;
                confidenceSummary.push({
                    skill: result.skillName,
                    avgConfidence,
                    totalCandidates: total,
                    category,
                });
            }

            candidates.forEach((candidate) => {
                const level = candidate.level || 'INCONNU';
                levelCounts[level] = (levelCounts[level] || 0) + 1;
            });
        });

        confidenceSummary.sort((a, b) => b.avgConfidence - a.avgConfidence);

        return {
            categoryCounts,
            levelCounts,
            totalCandidates: Object.values(categoryCounts).reduce((acc, value) => acc + value, 0),
            topConfidenceSkills: confidenceSummary.slice(0, 4),
        };
    }, [searchResults]);
}
