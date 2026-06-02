import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

/**
 * Garde de route par rôle. Si le rôle n'est pas autorisé, redirige vers « / »
 * (qui route ensuite selon le rôle via HomeRedirect). Évite les boucles car la
 * destination d'accueil est toujours une route permise pour le rôle.
 */
export default function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: JSX.Element;
}) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
