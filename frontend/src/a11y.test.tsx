import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { renderWithProviders } from '@/test/renderWithProviders';
import LoginPage from './pages/auth/LoginPage';
import VideoUpload from './components/video/VideoUpload';

// color-contrast désactivé : non calculable de façon fiable sous jsdom (pas de
// rendu CSS réel). On valide la structure a11y (labels, rôles, alt, etc.).
const axeOpts = { rules: { 'color-contrast': { enabled: false } } };

describe('Accessibilité (axe-core)', () => {
  it('LoginPage — aucune violation', async () => {
    const { container } = renderWithProviders(<LoginPage />, { route: '/login' });
    const results = await axe(container, axeOpts);
    expect(results.violations).toEqual([]);
  });

  it('VideoUpload (avec vidéo) — aucune violation', async () => {
    const { container } = renderWithProviders(
      <VideoUpload candidateId="c1" videoType="INTERVIEW" title="Vidéo d'entrevue" hasVideo />
    );
    const results = await axe(container, axeOpts);
    expect(results.violations).toEqual([]);
  });
});
