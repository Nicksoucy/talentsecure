import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import theme from '@/theme';

/**
 * QueryClient dédié aux tests : pas de retry (sinon les tests d'erreur attendent
 * les reprises) et pas de cache entre tests (gcTime: 0).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Route initiale (MemoryRouter). Défaut '/'. */
  route?: string;
  queryClient?: QueryClient;
}

/**
 * Rend un composant avec la MÊME pile de providers que l'app (main.tsx), adaptée
 * au test : MemoryRouter (route pilotable) + QueryClient sans retry/cache.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) {
  const { route = '/', queryClient = createTestQueryClient(), ...rtlOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <SnackbarProvider maxSnack={3}>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </SnackbarProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...rtlOptions }) };
}

// Ré-exporte RTL + user-event pour un import unique dans les tests.
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
