import { useAuthStore } from '@/store/authStore';

/**
 * Permissions dérivées du rôle — MIROIR du backend (qui reste l'autorité).
 * Sert à filtrer la nav et masquer les boutons d'écriture. Un bouton caché ne
 * remplace JAMAIS le 403 serveur.
 */
export function usePerms() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN';
  const isRh = role === 'RH_RECRUITER';
  const isMagasin = role === 'MAGASIN';
  return {
    role,
    isMagasin,
    canViewUniforms: isAdmin || isRh || isMagasin,
    canWriteUniforms: isAdmin || isRh,
    canWriteEmployees: isAdmin || isRh,
    canManageUsers: isAdmin,
  };
}
