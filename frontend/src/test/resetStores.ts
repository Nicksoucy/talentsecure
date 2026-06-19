import { useAuthStore } from '@/store/authStore';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { useWishlistStore } from '@/store/wishlistStore';

/**
 * Remet les stores Zustand (singletons module-level) à l'état déconnecté/vide
 * entre les tests, sinon l'état d'un test fuit sur le suivant.
 */
export function resetStores(): void {
  useAuthStore.getState().logout();
  useClientAuthStore.getState().logout();
  useWishlistStore.getState().reset();
}
