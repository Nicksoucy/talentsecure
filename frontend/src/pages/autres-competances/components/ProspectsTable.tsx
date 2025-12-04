import React from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Avatar,
    Chip,
    Tooltip,
    IconButton,
    TablePagination,
} from '@mui/material';
import {
    Visibility as VisibilityIcon,
    CloudUpload as UploadIcon,
    AutoAwesome as AutoAwesomeIcon,
    History as HistoryIcon,
} from '@mui/icons-material';

interface Prospect {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    city?: string;
    cvUrl?: string;
    cvStoragePath?: string;
    createdAt: string;
    contacted: boolean;
    _count?: { skills: number }; // NOUVEAU : compteur de compétences
}

interface ProspectsTableProps {
    prospects: Prospect[];
    selectedIds: string[];
    onSelect: (id: string) => void;
    onSelectAll: (checked: boolean) => void;
    onView: (id: string) => void;
    onExtract: (id: string, name: string, hasCv: boolean) => void;
    onViewHistory: (id: string, name: string) => void; // NOUVEAU
    page: number;
    rowsPerPage: number;
    onPageChange: (event: unknown, newPage: number) => void;
    onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    totalCount: number;
}

const ProspectsTable: React.FC<ProspectsTableProps> = ({
    prospects,
    selectedIds,
    onSelect,
    onSelectAll,
    onView,
    onExtract,
    onViewHistory, // NOUVEAU
    page,
    rowsPerPage,
    onPageChange,
    onRowsPerPageChange,
    totalCount,
}) => {
    const handleSelectAllChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onSelectAll(event.target.checked);
    };

    return (
        <>
            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    indeterminate={selectedIds.length > 0 && selectedIds.length < prospects.length}
                                    checked={prospects.length > 0 && selectedIds.length === prospects.length}
                                    onChange={handleSelectAllChange}
                                />
                            </TableCell>
                            <TableCell>Candidat Potentiel</TableCell>
                            <TableCell>Ville</TableCell>
                            <TableCell>CV</TableCell>
                            <TableCell>Date de soumission</TableCell>
                            <TableCell>Contacté</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {prospects.map((prospect) => (
                            <TableRow key={prospect.id} hover selected={selectedIds.includes(prospect.id)}>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={selectedIds.includes(prospect.id)}
                                        onChange={() => onSelect(prospect.id)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={2}>
                                        <Avatar>
                                            {prospect.firstName?.[0]}
                                            {prospect.lastName?.[0]}
                                        </Avatar>
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">
                                                {prospect.firstName} {prospect.lastName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {prospect.email}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell>{prospect.city || '-'}</TableCell>
                                <TableCell>
                                    {prospect.cvUrl || prospect.cvStoragePath ? (
                                        <Chip label="CV Disponible" color="success" size="small" icon={<UploadIcon />} />
                                    ) : (
                                        <Chip label="Pas de CV" color="default" size="small" />
                                    )}
                                </TableCell>
                                <TableCell>
                                    {new Date(prospect.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                    {prospect.contacted ? (
                                        <Chip label="Oui" color="success" size="small" />
                                    ) : (
                                        <Chip label="Non" color="warning" size="small" />
                                    )}
                                </TableCell>
                                <TableCell align="right">
                                    <Box display="flex" justifyContent="flex-end" gap={1}>
                                        <Tooltip title="Voir le profil">
                                            <IconButton size="small" onClick={() => onView(prospect.id)}>
                                                <VisibilityIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Historique d'extraction">
                                            <IconButton
                                                size="small"
                                                color="secondary"
                                                onClick={() => onViewHistory(
                                                    prospect.id,
                                                    `${prospect.firstName} ${prospect.lastName}`
                                                )}
                                            >
                                                <HistoryIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={prospect._count?.skills ? `Ré-extraire (${prospect._count.skills} compétences)` : "Extraire les compétences"}>
                                            <IconButton
                                                size="small"
                                                color={prospect._count?.skills ? "warning" : "primary"}
                                                onClick={() =>
                                                    onExtract(
                                                        prospect.id,
                                                        `${prospect.firstName} ${prospect.lastName}`,
                                                        !!(prospect.cvUrl || prospect.cvStoragePath)
                                                    )
                                                }
                                                disabled={!prospect.cvUrl && !prospect.cvStoragePath}
                                            >
                                                {prospect._count?.skills ? (
                                                    <Box display="flex" alignItems="center" gap={0.5}>
                                                        <AutoAwesomeIcon fontSize="small" />
                                                        <Typography variant="caption" fontWeight="bold">
                                                            {prospect._count.skills}
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <AutoAwesomeIcon fontSize="small" />
                                                )}
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                rowsPerPageOptions={[5, 10, 25, 50, 100]}
                component="div"
                count={totalCount}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={onPageChange}
                onRowsPerPageChange={onRowsPerPageChange}
                labelRowsPerPage="Lignes par page:"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
            />
        </>
    );
};

export default ProspectsTable;
