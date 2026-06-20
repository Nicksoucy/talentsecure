import { describe, it, expect } from 'vitest';
import {
  AddCircleOutline as CreateIcon,
  VisibilityOutlined as ReadIcon,
} from '@mui/icons-material';
import { activityVerb, activityVisual, activityText } from './activityLabel';
import type { DashboardActivity } from '@/services/dashboard.service';

describe('activityVerb', () => {
  it('traduit chaque action en phrase française avec la ressource connue', () => {
    expect(activityVerb('CREATE', 'Candidate')).toBe('a ajouté un candidat');
    expect(activityVerb('UPDATE', 'Catalogue')).toBe('a modifié un catalogue');
    expect(activityVerb('DELETE', 'Client')).toBe('a supprimé un client');
    expect(activityVerb('READ', 'Employee')).toBe('a consulté un employé');
  });

  it('ignore la ressource pour les actions de session et de transfert', () => {
    // LOGIN/LOGOUT/EXPORT/IMPORT ne mentionnent jamais la ressource passée.
    expect(activityVerb('LOGIN', 'Candidate')).toBe("s'est connecté");
    expect(activityVerb('LOGOUT', 'Client')).toBe("s'est déconnecté");
    expect(activityVerb('EXPORT', 'Catalogue')).toBe('a exporté des données');
    expect(activityVerb('IMPORT', 'User')).toBe('a importé des données');
  });

  it('retombe sur un libellé générique quand la ressource est absente, et encadre une ressource inconnue', () => {
    expect(activityVerb('CREATE', null)).toBe('a ajouté une ressource');
    expect(activityVerb('UPDATE', undefined)).toBe('a modifié une ressource');
    // Ressource hors dictionnaire → conservée telle quelle entre guillemets.
    expect(activityVerb('DELETE', 'Invoice')).toBe('a supprimé « Invoice »');
  });

  it('reconnaît les alias francisés et le candidat potentiel', () => {
    expect(activityVerb('CREATE', 'Candidat')).toBe('a ajouté un candidat');
    expect(activityVerb('CREATE', 'Employe')).toBe('a ajouté un employé');
    expect(activityVerb('CREATE', 'Prospect')).toBe('a ajouté un candidat potentiel');
    expect(activityVerb('CREATE', 'ProspectCandidate')).toBe(
      'a ajouté un candidat potentiel',
    );
  });
});

describe('activityVisual', () => {
  it('associe une icône et une couleur distinctes selon l\'action', () => {
    const create = activityVisual('CREATE');
    expect(create.Icon).toBe(CreateIcon);
    expect(create.color).toBe('#2e7d32');

    // EXPORT et IMPORT partagent la même couleur orange.
    expect(activityVisual('EXPORT').color).toBe('#ed6c02');
    expect(activityVisual('IMPORT').color).toBe('#ed6c02');
  });

  it('retombe sur le visuel READ pour une action non répertoriée', () => {
    // @ts-expect-error : on force une action hors union pour vérifier le fallback.
    const fallback = activityVisual('UNKNOWN');
    expect(fallback.Icon).toBe(ReadIcon);
    expect(fallback).toEqual(activityVisual('READ'));
  });
});

describe('activityText', () => {
  it('compose le nom de l\'utilisateur avec le verbe d\'action', () => {
    const activity: DashboardActivity = {
      id: 'act-1',
      action: 'UPDATE',
      resource: 'Candidate',
      resourceId: 'cand-1',
      details: null,
      createdAt: '2026-06-20T10:00:00.000Z',
      user: { name: 'Marie Dubois' },
    };
    expect(activityText(activity)).toBe('Marie Dubois a modifié un candidat');
  });

  it('gère une action de connexion sans accoler de ressource', () => {
    const activity: DashboardActivity = {
      id: 'act-2',
      action: 'LOGIN',
      resource: 'User',
      resourceId: null,
      details: null,
      createdAt: '2026-06-20T11:00:00.000Z',
      user: { name: 'Jean Tremblay' },
    };
    expect(activityText(activity)).toBe("Jean Tremblay s'est connecté");
  });
});
