import '@testing-library/jest-dom/vitest';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './server';

/**
 * Garantit la présence de `localStorage` sur le global. jsdom le fournit
 * normalement, mais l'initialisation de MSW (msw/node) dans cet environnement
 * peut le retirer du global → les stores Zustand (qui lisent localStorage à leur
 * création) plantent. Stub mémoire idempotent, ré-appliqué aux moments clés.
 */
function ensureLocalStorage(): void {
  if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) return;
  let store: Record<string, string> = {};
  const ls = {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  });
}
ensureLocalStorage();

// Serveur MSW : on intercepte tout le réseau. onUnhandledRequest:'error' force à
// déclarer chaque endpoint utilisé (attrape les appels oubliés).
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  ensureLocalStorage();
});

afterEach(() => {
  server.resetHandlers();
  ensureLocalStorage();
  localStorage.clear();
  vi.restoreAllMocks();
});

afterAll(() => server.close());

// NB : resetStores() n'est PAS appelé globalement ici — l'importer chargerait les
// stores Zustand dans des fichiers qui ne les utilisent pas. Les tests qui mutent
// un store importent et appellent `resetStores()` (src/test/resetStores.ts).

// jsdom n'implémente pas window.matchMedia (utilisé par MUI au montage) → stub.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
