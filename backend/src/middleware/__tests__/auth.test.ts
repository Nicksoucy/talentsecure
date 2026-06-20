import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import passport from 'passport';
import {
  authenticateJWT,
  authenticateStaff,
  authorizeRoles,
  authorizeReadWrite,
  optionalJWT,
} from '../auth';

// Stube la stratégie passport 'jwt' : on contrôle (err, user) sans DB ni token.
function stubPassport(result: { err?: unknown; user?: unknown }): void {
  jest.spyOn(passport, 'authenticate').mockImplementation(
    ((_strategy: unknown, _opts: unknown, cb: (e: unknown, u: unknown) => void) =>
      (_req: Request, _res: Response, _next: NextFunction) =>
        cb(result.err ?? null, 'user' in result ? result.user : false)) as never
  );
}

// Injecte un req.user pour tester les gardes de rôle sans passport.
const injectUser =
  (role: string) => (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      id: 'u1',
      email: 'u@test.com',
      role,
      firstName: 'T',
      lastName: 'U',
    };
    next();
  };

const ok = (req: Request, res: Response) =>
  res.json({ ok: true, role: (req.user as { role?: string })?.role ?? null });

afterEach(() => jest.restoreAllMocks());

describe('middleware/auth', () => {
  describe('authenticateJWT', () => {
    it('401 sans utilisateur', async () => {
      stubPassport({ user: false });
      const app = express().get('/p', authenticateJWT, ok);
      expect((await request(app).get('/p')).status).toBe(401);
    });

    it('200 et expose req.user si token valide', async () => {
      stubPassport({ user: { id: 'u1', role: 'ADMIN' } });
      const app = express().get('/p', authenticateJWT, ok);
      const res = await request(app).get('/p');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('ADMIN');
    });

    it('500 si la stratégie renvoie une erreur', async () => {
      stubPassport({ err: new Error('boom') });
      const app = express().get('/p', authenticateJWT, ok);
      expect((await request(app).get('/p')).status).toBe(500);
    });
  });

  describe('authenticateStaff (S1 — bloque les tokens CLIENT sur le backoffice)', () => {
    it('403 pour un token de rôle CLIENT', async () => {
      stubPassport({ user: { id: 'c1', role: 'CLIENT' } });
      const app = express().get('/p', authenticateStaff, ok);
      expect((await request(app).get('/p')).status).toBe(403);
    });

    it('200 pour un rôle staff (ADMIN)', async () => {
      stubPassport({ user: { id: 'u1', role: 'ADMIN' } });
      const app = express().get('/p', authenticateStaff, ok);
      expect((await request(app).get('/p')).status).toBe(200);
    });

    it('401 sans utilisateur', async () => {
      stubPassport({ user: false });
      const app = express().get('/p', authenticateStaff, ok);
      expect((await request(app).get('/p')).status).toBe(401);
    });
  });

  describe('authorizeRoles', () => {
    it('autorise un rôle listé', async () => {
      const app = express().get('/p', injectUser('RH_RECRUITER'), authorizeRoles('ADMIN', 'RH_RECRUITER'), ok);
      expect((await request(app).get('/p')).status).toBe(200);
    });

    it('403 pour un rôle non listé', async () => {
      const app = express().get('/p', injectUser('SALES'), authorizeRoles('ADMIN'), ok);
      expect((await request(app).get('/p')).status).toBe(403);
    });

    it('401 sans req.user', async () => {
      const app = express().get('/p', authorizeRoles('ADMIN'), ok);
      expect((await request(app).get('/p')).status).toBe(401);
    });
  });

  describe('authorizeReadWrite (invariant : un rôle lecture seule ne peut pas écrire)', () => {
    // MAGASIN peut LIRE, seul ADMIN peut ÉCRIRE.
    const guard = authorizeReadWrite(['MAGASIN', 'ADMIN'] as never, ['ADMIN'] as never);

    function buildApp(role: string) {
      const app = express();
      app.use(express.json());
      app.get('/p', injectUser(role), guard, ok);
      app.post('/p', injectUser(role), guard, ok);
      return app;
    }

    it('MAGASIN : 200 sur GET (lecture autorisée)', async () => {
      expect((await request(buildApp('MAGASIN')).get('/p')).status).toBe(200);
    });

    it('MAGASIN : 403 sur POST (écriture interdite)', async () => {
      expect((await request(buildApp('MAGASIN')).post('/p').send({})).status).toBe(403);
    });

    it('ADMIN : 200 sur GET et POST', async () => {
      const app = buildApp('ADMIN');
      expect((await request(app).get('/p')).status).toBe(200);
      expect((await request(app).post('/p').send({})).status).toBe(200);
    });

    it('401 sans req.user', async () => {
      const app = express();
      app.get('/p', guard, ok);
      expect((await request(app).get('/p')).status).toBe(401);
    });
  });

  describe('optionalJWT', () => {
    it('passe sans rejeter quand non authentifié', async () => {
      stubPassport({ user: false });
      const app = express().get('/p', optionalJWT, ok);
      const res = await request(app).get('/p');
      expect(res.status).toBe(200);
      expect(res.body.role).toBeNull();
    });

    it('attache req.user si présent', async () => {
      stubPassport({ user: { id: 'u1', role: 'SALES' } });
      const app = express().get('/p', optionalJWT, ok);
      expect((await request(app).get('/p')).body.role).toBe('SALES');
    });
  });
});
