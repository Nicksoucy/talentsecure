import { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Undo as UndoIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { Candidate } from '@/types';

interface CandidateActionsMenuProps {
  candidate: Candidate;
  onView: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onRevertToProspect?: () => void;
  onExtractSkills?: () => void;
  userRole?: string;
}

export default function CandidateActionsMenu({
  candidate,
  onView,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onRevertToProspect,
  onExtractSkills,
  userRole = 'ADMIN',
}: CandidateActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'archive' | 'unarchive' | 'delete' | 'revert' | null;
  }>({ open: false, type: null });

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleOpenConfirmDialog = (type: 'archive' | 'unarchive' | 'delete' | 'revert') => {
    setConfirmDialog({ open: true, type });
    handleCloseMenu();
  };

  const handleCloseConfirmDialog = () => {
    setConfirmDialog({ open: false, type: null });
  };

  const handleConfirmAction = () => {
    switch (confirmDialog.type) {
      case 'archive':
        onArchive();
        break;
      case 'unarchive':
        onUnarchive();
        break;
      case 'delete':
        onDelete();
        break;
      case 'revert':
        if (onRevertToProspect) {
          onRevertToProspect();
        }
        break;
    }
    handleCloseConfirmDialog();
  };

  const getDialogContent = () => {
    switch (confirmDialog.type) {
      case 'archive':
        return {
          title: 'Archiver le candidat',
          message: `Êtes-vous sûr de vouloir archiver ${candidate.firstName} ${candidate.lastName} ? Le candidat ne sera plus visible dans la liste principale.`,
          confirmText: 'Archiver',
          confirmColor: 'warning' as const,
        };
      case 'unarchive':
        return {
          title: 'Désarchiver le candidat',
          message: `Êtes-vous sûr de vouloir désarchiver ${candidate.firstName} ${candidate.lastName} ? Le candidat sera à nouveau visible dans la liste principale.`,
          confirmText: 'Désarchiver',
          confirmColor: 'primary' as const,
        };
      case 'delete':
        return {
          title: 'Supprimer le candidat',
          message: `Êtes-vous sûr de vouloir supprimer ${candidate.firstName} ${candidate.lastName} ? Cette action est irréversible.`,
          confirmText: 'Supprimer',
          confirmColor: 'error' as const,
        };
      case 'revert':
        return {
          title: 'Re-convertir en candidat potentiel',
          message: `Êtes-vous sûr de vouloir re-convertir ${candidate.firstName} ${candidate.lastName} en candidat potentiel ? Le candidat sera supprimé et un nouveau prospect sera créé avec toutes ses informations (y compris le CV).`,
          confirmText: 'Re-convertir',
          confirmColor: 'primary' as const,
        };
      default:
        return null;
    }
  };

  const dialogContent = getDialogContent();

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpenMenu}
        title="Plus d'actions"
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={() => { onView(); handleCloseMenu(); }}>
          <ListItemIcon>
            <ViewIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Voir le détail</ListItemText>
        </MenuItem>

        {onExtractSkills && (
          <MenuItem onClick={() => { onExtractSkills(); handleCloseMenu(); }}>
            <ListItemIcon>
              <PsychologyIcon fontSize="small" color="secondary" />
            </ListItemIcon>
            <ListItemText>Analyser CV (IA)</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={() => { onEdit(); handleCloseMenu(); }}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Modifier</ListItemText>
        </MenuItem>

        {candidate.isArchived ? (
          <MenuItem onClick={() => handleOpenConfirmDialog('unarchive')}>
            <ListItemIcon>
              <UnarchiveIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Désarchiver</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => handleOpenConfirmDialog('archive')}>
            <ListItemIcon>
              <ArchiveIcon fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText>Archiver</ListItemText>
          </MenuItem>
        )}

        {userRole === 'ADMIN' && onRevertToProspect && (
          <MenuItem onClick={() => handleOpenConfirmDialog('revert')}>
            <ListItemIcon>
              <UndoIcon fontSize="small" sx={{ color: 'primary.main' }} />
            </ListItemIcon>
            <ListItemText>Re-convertir en candidat potentiel</ListItemText>
          </MenuItem>
        )}

        {userRole === 'ADMIN' && (
          <MenuItem onClick={() => handleOpenConfirmDialog('delete')}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Supprimer</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Confirmation Dialog */}
      {dialogContent && (
        <Dialog
          open={confirmDialog.open}
          onClose={handleCloseConfirmDialog}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogTitle>{dialogContent.title}</DialogTitle>
          <DialogContent>
            <DialogContentText>{dialogContent.message}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseConfirmDialog}>Annuler</Button>
            <Button
              onClick={handleConfirmAction}
              color={dialogContent.confirmColor}
              variant="contained"
            >
              {dialogContent.confirmText}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
