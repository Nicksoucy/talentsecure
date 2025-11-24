import { useQuery } from '@tanstack/react-query';
import { candidateService } from '@/services/candidate.service';

export interface CandidateStats {
    total: number;
    elite: number;
    excellent: number;
    veryGood: number;
    good: number;
    qualified: number;
    toReview: number;
    pending: number;
    absent: number;
    inactive: number;
}

export function useCandidateStats() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['candidates', 'stats'],
        queryFn: async () => {
            console.log('Fetching candidate stats...');
            try {
                const res = await candidateService.getCandidatesStats();
                console.log('Candidate stats fetched:', res);
                return res;
            } catch (err) {
                console.error('Error fetching candidate stats:', err);
                throw err;
            }
        },
        staleTime: 0,
        refetchOnWindowFocus: true,
    });

    return {
        stats: data?.data as CandidateStats | undefined,
        isLoading,
        error,
        refetch,
    };
}
