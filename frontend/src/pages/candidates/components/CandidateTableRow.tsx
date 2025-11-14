import {
  TableRow,
  TableCell,
  Checkbox,
  Chip,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Candidate } from '@/types';
import CandidateActionsMenu from './CandidateActionsMenu';

const STATUS_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  ELITE: 'error',
  EXCELLENT: 'success',
  TRES_BON: 'info',
  BON: 'info',
  QUALIFIE: 'warning',
  EN_ATTENTE: 'default',
  ABSENT: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  ELITE: 'Élite',
  EXCELLENT: 'Excellent',
  TRES_BON: 'Très bon',
  BON: 'Bon',
  QUALIFIE: 'Qualifié',
  A_REVOIR: 'À revoir',
  EN_ATTENTE: 'En attente',
  INACTIF: 'Inactif',
  ABSENT: 'Absent',
};

interface CandidateTableRowProps {
  candidate: Candidate;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  userRole?: string;
}

export default function CandidateTableRow({
  candidate,
  isSelected,
  onSelect,
  onView,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  userRole,
}: CandidateTableRowProps) {
  return (
    <TableRow
      hover
      sx={{
        backgroundColor: candidate.isArchived ? 'action.hover' : undefined,
        opacity: candidate.isArchived ? 0.6 : 1,
      }}
    >
      <TableCell padding="checkbox">
        <Checkbox
          checked={isSelected}
          onChange={onSelect}
        />
      </TableCell>

      <TableCell>
        {candidate.firstName} {candidate.lastName}
        {candidate.isArchived && (
          <Chip
            label="Archivé"
            size="small"
            color="default"
            sx={{ ml: 1 }}
          />
        )}
      </TableCell>

      <TableCell>{candidate.phone}</TableCell>

      <TableCell>{candidate.city}</TableCell>

      <TableCell>
        {candidate.interviewDate
          ? new Date(candidate.interviewDate).toLocaleDateString('fr-FR')
          : '-'}
      </TableCell>

      <TableCell>
        <Chip
          label={STATUS_LABELS[candidate.status] || candidate.status}
          color={STATUS_COLORS[candidate.status] || 'default'}
          size="small"
        />
      </TableCell>

      <TableCell>
        {candidate.globalRating ? `${candidate.globalRating}/10` : '-'}
      </TableCell>

      <TableCell sx={{ maxWidth: 300 }}>
        {(() => {
          const hrNotes = candidate.hrNotes;
          if (!hrNotes) return '-';
          // Show first 100 characters
          return hrNotes.length > 100
            ? `${hrNotes.substring(0, 100)}...`
            : hrNotes;
        })()}
      </TableCell>

      <TableCell align="center">
        {candidate.cvUrl ? (
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
        ) : (
          <CancelIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        )}
      </TableCell>

      <TableCell>
        {candidate.hasBSP ? '✓' : '-'}
      </TableCell>

      <TableCell align="right">
        <CandidateActionsMenu
          candidate={candidate}
          onView={onView}
          onEdit={onEdit}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
          userRole={userRole}
        />
      </TableCell>
    </TableRow>
  );
}
