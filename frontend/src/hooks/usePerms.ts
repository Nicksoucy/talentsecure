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
  const isMagasin = role === 'MAGASIN'; // magasin lecture seule
  const isMagasinGestion = role === 'MAGASIN_GESTION'; // gestion complète uniformes
  const isMagasinAny = isMagasin || isMagasinGestion; // nav restreinte (Employés + Uniformes)
  return {
    role,
    isMagasin,
    isMagasinGestion,
    isMagasinAny,
    canViewUniforms: isAdmin || isRh || isMagasinAny,
    canWriteUniforms: isAdmin || isRh || isMagasinGestion,
    canWriteEmployees: isAdmin || isRh,
    canManageUsers: isAdmin,
  };
}
