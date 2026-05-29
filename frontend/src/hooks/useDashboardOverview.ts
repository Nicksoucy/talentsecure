import { useQuery } from '@tanstack/react-query';
import { dashboardService, DashboardOverview } from '@/services/dashboard.service';

export function useDashboardOverview() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardService.getOverview(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return {
    overview: data?.data as DashboardOverview | undefined,
    isLoading,
    error,
    refetch,
  };
}
