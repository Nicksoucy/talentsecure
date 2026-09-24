import { useRef } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Checkbox,
    Box,
    Typography,
    Pagination,
    Button,
} from '@mui/material';
import {
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon,
    Add as AddIcon,
} from '@mui/icons-material';
import CandidateTableRow from './CandidateTableRow';

interface CandidatesTableProps {
    candidates: any[];
    isLoading: boolean;
    pagination?: {
        page: number;
        totalPages: number;
        total: number;
    };
    // Sorting
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onSort: (field: string) => void;
    // Selection
    selectedCandidates: Set<string>;
    onSelectCandidate: (id: string) => void;
    onSelectAll: () => void;
    // Actions
    onView: (candidateId: string) => void;
    onEdit: (candidateId: string) => void;
    onArchive: (id: string, label: string) => void;
    onUnarchive: (id: string, label: string) => void;
    onDelete: (id: string, label: string) => void;
    onRevertToProspect?: (id: string, label: string) => void;
    onPromote?: (id: string, label: string) => void;
    onExtractSkills: (candidate: any) => void;
    // Pagination
    page: number;
    onPageChange: (page: number) => void;
    // User
    userRole?: string;
    // Empty state
    onAddCandidate: () => void;
}

export default function CandidatesTable({
    candidates,
    pagination,
    sortBy,
    sortOrder,
    onSort,
    selectedCandidates,
    onSelectCandidate,
    onSelectAll,
    onView,
    onEdit,
    onArchive,
    onUnarchive,
    onDelete,
    onRevertToProspect,
    onPromote,
    onExtractSkills,
    page,
    onPageChange,
    userRole,
    onAddCandidate,
}: CandidatesTableProps) {
    // Ancre de la barre de pages du haut : en changeant de page depuis le bas,
    // on remonte ici pour lire la nouvelle page depuis le début.
    const topRef = useRef<HTMLDivElement>(null);

    // Empty state
    if (candidates.length === 0) {
        return (
            <Box textAlign="center" py={4}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                    Aucun candidat trouvé
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    Commencez par ajouter votre premier candidat !
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={onAddCandidate}
                >
                    Ajouter un candidat
                </Button>
            </Box>
        );
    }

    const renderPager = (position: 'top' | 'bottom') =>
        pagination && (
            <Box
                ref={position === 'top' ? topRef : undefined}
                display="flex"
                justifyContent="center"
                alignItems="center"
                flexWrap="wrap"
                gap={2}
                {...(position === 'top' ? { mb: 2, sx: { scrollMarginTop: 80 } } : { mt: 3 })}
            >
                <Typography variant="body2" color="text.secondary">
                    Page {pagination.page} sur {pagination.totalPages} ({pagination.total} candidats au total)
                </Typography>
                <Pagination
                    count={pagination.totalPages}
                    page={page}
                    onChange={(_, newPage) => {
                        onPageChange(newPage);
                        if (position === 'bottom') {
                            topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                        }
                    }}
                    color="primary"
                    showFirstButton
                    showLastButton
                />
            </Box>
        );

    return (
        <>
            {/* Pagination en haut aussi : pas besoin de descendre pour changer de page */}
            {renderPager('top')}

            <TableContainer component={Paper} elevation={0}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    indeterminate={selectedCandidates.size > 0 && selectedCandidates.size < candidates.length}
                                    checked={candidates.length > 0 && selectedCandidates.size === candidates.length}
                                    onChange={onSelectAll}
                                />
                            </TableCell>
                            <TableCell
                                sx={{ cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => onSort('firstName')}
                            >
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <strong>Nom</strong>
                                    {sortBy === 'firstName' && (
                                        sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                                    )}
                                </Box>
                            </TableCell>
                            <TableCell><strong>Téléphone</strong></TableCell>
                            <TableCell><strong>Ville</strong></TableCell>
                            <TableCell
                                sx={{ cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => onSort('interviewDate')}
                            >
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <strong>Date d'entrevue</strong>
                                    {sortBy === 'interviewDate' && (
                                        sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                                    )}
                                </Box>
                            </TableCell>
                            <TableCell><strong>Statut</strong></TableCell>
                            <TableCell
                                sx={{ cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => onSort('globalRating')}
                            >
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <strong>Note</strong>
                                    {sortBy === 'globalRating' && (
                                        sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                                    )}
                                </Box>
                            </TableCell>
                            <TableCell><strong>Badges</strong></TableCell>
                            <TableCell><strong>Avis RH</strong></TableCell>
                            <TableCell align="center"><strong>CV</strong></TableCell>
                            <TableCell><strong>BSP</strong></TableCell>
                            <TableCell align="right"><strong>Actions</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {candidates.map((candidate: any) => {
                            const label = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || candidate.email || `ID ${candidate.id}`;
                            return (
                                <CandidateTableRow
                                    key={candidate.id}
                                    candidate={candidate}
                                    isSelected={selectedCandidates.has(candidate.id)}
                                    onSelect={() => onSelectCandidate(candidate.id)}
                                    onView={() => onView(candidate.id)}
                                    onEdit={() => onEdit(candidate.id)}
                                    onArchive={() => onArchive(candidate.id, label)}
                                    onUnarchive={() => onUnarchive(candidate.id, label)}
                                    onDelete={() => onDelete(candidate.id, label)}
                                    onRevertToProspect={onRevertToProspect ? () => onRevertToProspect(candidate.id, label) : undefined}
                                    onPromote={onPromote ? () => onPromote(candidate.id, label) : undefined}
                                    onExtractSkills={() => onExtractSkills(candidate)}
                                    userRole={userRole}
                                />
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {renderPager('bottom')}
        </>
    );
}
