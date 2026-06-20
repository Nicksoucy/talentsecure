import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Serveur MSW (Node) partagé par tous les tests. Démarré/arrêté dans setup.ts.
export const server = setupServer(...handlers);
