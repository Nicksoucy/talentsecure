import { ComponentType } from 'react';
import {
  AddCircleOutline as CreateIcon,
  EditOutlined as UpdateIcon,
  DeleteOutline as DeleteIcon,
  LoginOutlined as LoginIcon,
  LogoutOutlined as LogoutIcon,
  FileDownloadOutlined as ExportIcon,
  FileUploadOutlined as ImportIcon,
  VisibilityOutlined as ReadIcon,
} from '@mui/icons-material';
import { SvgIconProps } from '@mui/material';
import { AuditActionType, DashboardActivity } from '@/services/dashboard.service';

/** Nom français lisible d'une ressource auditée (avec article). */
const RESOURCE_FR: Record<string, string> = {
  Candidate: 'un candidat',
  Candidat: 'un candidat',
  Prospect: 'un candidat potentiel',
  ProspectCandidate: 'un candidat potentiel',
  Catalogue: 'un catalogue',
  Client: 'un client',
  Contact: 'un contact',
  Employee: 'un employé',
  Employe: 'un employé',
  User: 'un utilisateur',
  Wishlist: 'une liste de souhaits',
  Placement: 'un placement',
  Uniform: 'un uniforme',
};

function resourceFr(resource?: string | null): string {
  if (!resource) return 'une ressource';
  return RESOURCE_FR[resource] || `« ${resource} »`;
}

const ACTION_VISUAL: Record<AuditActionType, { Icon: ComponentType<SvgIconProps>; color: string }> = {
  CREATE: { Icon: CreateIcon, color: '#2e7d32' },
  UPDATE: { Icon: UpdateIcon, color: '#1976d2' },
  DELETE: { Icon: DeleteIcon, color: '#d32f2f' },
  LOGIN: { Icon: LoginIcon, color: '#7b1fa2' },
  LOGOUT: { Icon: LogoutIcon, color: '#616161' },
  EXPORT: { Icon: ExportIcon, color: '#ed6c02' },
  IMPORT: { Icon: ImportIcon, color: '#ed6c02' },
  READ: { Icon: ReadIcon, color: '#9e9e9e' },
};

/** Phrase française décrivant l'action (sans le nom de l'utilisateur). */
export function activityVerb(action: AuditActionType, resource?: string | null): string {
  const res = resourceFr(resource);
  switch (action) {
    case 'CREATE':
      return `a ajouté ${res}`;
    case 'UPDATE':
      return `a modifié ${res}`;
    case 'DELETE':
      return `a supprimé ${res}`;
    case 'EXPORT':
      return `a exporté des données`;
    case 'IMPORT':
      return `a importé des données`;
    case 'LOGIN':
      return `s'est connecté`;
    case 'LOGOUT':
      return `s'est déconnecté`;
    case 'READ':
    default:
      return `a consulté ${res}`;
  }
}

/** Visuel (icône + couleur) associé à une action. */
export function activityVisual(action: AuditActionType) {
  return ACTION_VISUAL[action] || ACTION_VISUAL.READ;
}

/** Construit le texte complet "Prénom Nom a modifié un candidat". */
export function activityText(activity: DashboardActivity): string {
  return `${activity.user.name} ${activityVerb(activity.action, activity.resource)}`;
}
