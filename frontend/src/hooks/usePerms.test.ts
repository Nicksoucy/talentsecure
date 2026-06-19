import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { usePerms } from './usePerms';
import { makeUser } from '@/test/factories';

function setRole(role?: string) {
  if (role) {
    useAuthStore.setState({ user: makeUser({ role: role as any }), isAuthenticated: true });
  } else {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  }
}

describe('usePerms — matrice de permissions par rôle', () => {
  it('ADMIN a tous les droits', () => {
    setRole('ADMIN');
    const { result } = renderHook(() => usePerms());
    expect(result.current.canManageUsers).toBe(true);
    expect(result.current.canWriteUniforms).toBe(true);
    expect(result.current.canWriteEmployees).toBe(true);
    expect(result.current.canViewUniforms).toBe(true);
  });

  it('MAGASIN = uniformes en lecture seule (peut préparer un brouillon, pas écrire)', () => {
    setRole('MAGASIN');
    const { result } = renderHook(() => usePerms());
    expect(result.current.canViewUniforms).toBe(true);
    expect(result.current.canPrepareUniformDraft).toBe(true);
    expect(result.current.canWriteUniforms).toBe(false);
    expect(result.current.canWriteEmployees).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
  });

  it('MAGASIN_GESTION peut écrire les uniformes mais pas gérer les users', () => {
    setRole('MAGASIN_GESTION');
    const { result } = renderHook(() => usePerms());
    expect(result.current.canWriteUniforms).toBe(true);
    expect(result.current.canWriteEmployees).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
  });

  it('RH_RECRUITER : employés + uniformes, pas la gestion des users', () => {
    setRole('RH_RECRUITER');
    const { result } = renderHook(() => usePerms());
    expect(result.current.canWriteEmployees).toBe(true);
    expect(result.current.canWriteUniforms).toBe(true);
    expect(result.current.canManageUsers).toBe(false);
  });

  it('SALES : aucun droit uniformes / employés / users', () => {
    setRole('SALES');
    const { result } = renderHook(() => usePerms());
    expect(result.current.canViewUniforms).toBe(false);
    expect(result.current.canWriteEmployees).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
  });

  it('non connecté : tout est faux', () => {
    setRole(undefined);
    const { result } = renderHook(() => usePerms());
    expect(result.current.canViewUniforms).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.role).toBeUndefined();
  });
});
