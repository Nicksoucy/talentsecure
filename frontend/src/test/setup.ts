import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';

// Reset localStorage and mocks between tests so state doesn't leak.
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// jsdom doesn't implement window.matchMedia. MUI components use it on mount,
// so stub it to avoid noisy errors during render in unrelated tests.
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
