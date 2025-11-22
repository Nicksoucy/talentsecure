import {
  Box,
  Button,
  Chip,
} from '@mui/material';
import {
  Description as DescriptionIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
} from '@mui/icons-material';

interface CandidateBulkActionsProps {
  selectedCount: number;
  onCreateCatalogue: () => void;
  onClearSelection: () => void;
  onRevertToProspect?: () => void;
}

export default function CandidateBulkActions({
  selectedCount,
  onCreateCatalogue,
  onClearSelection,
  onRevertToProspect,
}: CandidateBulkActionsProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: 'primary.main',
        color: 'white',
        px: 3,
        py: 2,
        borderRadius: 2,
        boxShadow: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Chip
        label={`${selectedCount} candidat${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''}`}
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          color: 'white',
          fontWeight: 'bold',
        }}
      />

      <Button
        variant="contained"
        sx={{
          backgroundColor: 'white',
          color: 'primary.main',
          '&:hover': {
            backgroundColor: 'grey.100',
          },
        }}
        startIcon={<DescriptionIcon />}
        onClick={onCreateCatalogue}
      >
        Créer un catalogue
      </Button>

      {onRevertToProspect && (
        <Button
          variant="contained"
          sx={{
            backgroundColor: 'warning.main',
            color: 'white',
            '&:hover': {
              backgroundColor: 'warning.dark',
            },
          }}
          startIcon={<UndoIcon />}
          onClick={onRevertToProspect}
        >
          Re-convertir
        </Button>
      )}

      <Button
        variant="text"
        sx={{
          color: 'white',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          },
        }}
        startIcon={<ClearIcon />}
        onClick={onClearSelection}
      >
        Annuler
      </Button>
    </Box>
  );
}
