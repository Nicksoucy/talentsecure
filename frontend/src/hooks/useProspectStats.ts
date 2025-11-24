import { useQuery } from '@tanstack/react-query';
import { prospectService } from '@/services/prospect.service';

export interface ProspectStats {
    total: number;
    pending: number;
    contacted: number;
    converted: number;
    conversionRate: string; // API returns string like "15.5%"
}

export function useProspectStats() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['prospects', 'stats'],
        queryFn: async () => {
            console.log('Fetching prospect stats...');
            try {
                const res = await prospectService.getProspectsStats();
                console.log('Prospect stats fetched:', res);
                return res;
            } catch (err) {
                console.error('Error fetching prospect stats:', err);
                throw err;
            }
        },
        staleTime: 0, // Force fetch
        refetchOnWindowFocus: true,
    });

    return {
        stats: data?.data as ProspectStats | undefined,
        isLoading,
        error,
        refetch,
    };
}
