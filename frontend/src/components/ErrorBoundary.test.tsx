import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';

// Mock du module Sentry : on pilote sentryEnabled et on espionne captureException.
vi.mock('@/config/sentry', () => ({
  sentryEnabled: true,
  Sentry: {
    withScope: vi.fn((cb: (scope: { setExtra: ReturnType<typeof vi.fn> }) => void) =>
      cb({ setExtra: vi.fn() })
    ),
    captureException: vi.fn(),
  },
}));

import ErrorBoundary from './ErrorBoundary';
import { Sentry, sentryEnabled } from '@/config/sentry';

const sentryMock = Sentry as unknown as {
  withScope: ReturnType<typeof vi.fn>;
  captureException: ReturnType<typeof vi.fn>;
};

// Enfant nommé qui lève une erreur au rendu, pour déclencher la frontière.
function Boom({ message = 'Crash du composant enfant' }: { message?: string }): JSX.Element {
  throw new Error(message);
}
Boom.displayName = 'Boom';

// Silence le console.error attendu (React + componentDidCatch) pendant les tests.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  it('rend les enfants tels quels quand aucune erreur ne survient', () => {
    renderWithProviders(
      <ErrorBoundary>
        <div>Contenu normal</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Contenu normal')).toBeInTheDocument();
    expect(
      screen.queryByText('Une erreur inattendue est survenue.')
    ).not.toBeInTheDocument();
  });

  it('affiche le fallback et le message de l\'erreur quand un enfant lève', () => {
    renderWithProviders(
      <ErrorBoundary>
        <Boom message="Boom test" />
      </ErrorBoundary>
    );

    expect(
      screen.getByText('Une erreur inattendue est survenue.')
    ).toBeInTheDocument();
    // Le message de l'erreur capturée est affiché.
    expect(screen.getByText('Boom test')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Recharger la page/ })
    ).toBeInTheDocument();
  });

  it('journalise l\'erreur et la transmet à Sentry quand sentryEnabled est vrai', () => {
    expect(sentryEnabled).toBe(true);

    renderWithProviders(
      <ErrorBoundary>
        <Boom message="Erreur surveillée" />
      </ErrorBoundary>
    );

    // componentDidCatch journalise via console.error.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Erreur UI capturee',
      expect.any(Error),
      expect.anything()
    );
    // Et capture l'exception via Sentry.
    expect(sentryMock.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Erreur surveillée' })
    );
  });

  it('recharge la page au clic sur "Recharger la page"', async () => {
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    // window.location.reload n'est pas appelable en jsdom : on le remplace.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    try {
      renderWithProviders(
        <ErrorBoundary>
          <Boom message="Avant rechargement" />
        </ErrorBoundary>
      );

      await userEvent.click(
        screen.getByRole('button', { name: /Recharger la page/ })
      );

      expect(reloadMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
