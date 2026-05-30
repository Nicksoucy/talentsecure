import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import {
  Description as DescriptionIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  VideoLibrary as VideoIcon,
} from '@mui/icons-material';
import CVPreview from '@/components/CVPreview';
import ProspectVideoPlayer from '@/components/video/ProspectVideoPlayer';
import ContactConflictDialog from '@/components/ContactConflictDialog';
import { ContactConflict } from '@/services/contact.service';
import { ProspectCandidate } from '@/types';

interface ContactDialogState {
  open: boolean;
  prospect: ProspectCandidate | null;
}
interface CvPreviewState {
  open: boolean;
  cvUrl: string | null;
  prospectName: string;
}
interface VideoPreviewState {
  open: boolean;
  prospectId: string | null;
  prospectName: string;
}
interface ProspectForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  streetAddress: string;
}

export interface ProspectsDialogsProps {
  // Contact
  contactDialog: ContactDialogState;
  setContactDialog: (v: ContactDialogState) => void;
  contactNotes: string;
  setContactNotes: (v: string) => void;
  onConfirmContact: () => void;
  contactPending: boolean;
  // CV preview
  cvPreviewDialog: CvPreviewState;
  setCvPreviewDialog: (v: CvPreviewState) => void;
  // Video preview
  videoPreviewDialog: VideoPreviewState;
  setVideoPreviewDialog: (v: VideoPreviewState) => void;
  // Add prospect
  addProspectOpen: boolean;
  setAddProspectOpen: (v: boolean) => void;
  prospectForm: ProspectForm;
  setProspectForm: (v: ProspectForm) => void;
  onCreateProspect: () => void;
  createPending: boolean;
  // Conflit de contact
  contactConflict: ContactConflict | null;
  setContactConflict: (v: ContactConflict | null) => void;
  // Transfert vers client
  assignClientDialogOpen: boolean;
  setAssignClientDialogOpen: (v: boolean) => void;
  assignClientId: string;
  setAssignClientId: (v: string) => void;
  clients: any[];
  onAssignToClient: () => void;
  assignPending: boolean;
  selectedCount: number;
}

/**
 * Regroupe les 5 dialogues de la page Candidats Potentiels (contact, aperçu CV,
 * aperçu vidéo, ajout de prospect, transfert vers un client) + le dialogue de
 * conflit de contact. JSX déplacé verbatim depuis ProspectsPage ; l'état reste
 * dans la page et est passé en props (comportement identique).
 */
export default function ProspectsDialogs(props: ProspectsDialogsProps) {
  const {
    contactDialog, setContactDialog, contactNotes, setContactNotes,
    onConfirmContact, contactPending,
    cvPreviewDialog, setCvPreviewDialog,
    videoPreviewDialog, setVideoPreviewDialog,
    addProspectOpen, setAddProspectOpen, prospectForm, setProspectForm,
    onCreateProspect, createPending,
    contactConflict, setContactConflict,
    assignClientDialogOpen, setAssignClientDialogOpen, assignClientId, setAssignClientId,
    clients, onAssignToClient, assignPending, selectedCount,
  } = props;

  return (
    <>
      {/* Contact Dialog */}
      <Dialog
        open={contactDialog.open}
        onClose={() => setContactDialog({ open: false, prospect: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Marquer comme contacté</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {contactDialog.prospect &&
              `${contactDialog.prospect.firstName} ${contactDialog.prospect.lastName}`}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes (optionnel)"
            value={contactNotes}
            onChange={(e) => setContactNotes(e.target.value)}
            placeholder="Ajouter des notes sur le contact..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialog({ open: false, prospect: null })}>
            Annuler
          </Button>
          <Button
            onClick={onConfirmContact}
            variant="contained"
            disabled={contactPending}
          >
            {contactPending ? 'En cours...' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CV Preview Dialog */}
      <Dialog
        open={cvPreviewDialog.open}
        onClose={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DescriptionIcon />
              <Typography variant="h6">
                CV - {cvPreviewDialog.prospectName}
              </Typography>
            </Box>
            <IconButton
              onClick={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: '80vh' }}>
          {cvPreviewDialog.cvUrl && (
            <CVPreview
              url={cvPreviewDialog.cvUrl}
              fileName={`CV - ${cvPreviewDialog.prospectName}`}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => window.open(cvPreviewDialog.cvUrl!, '_blank')}
            startIcon={<DownloadIcon />}
            variant="outlined"
          >
            Télécharger
          </Button>
          <Button
            onClick={() => setCvPreviewDialog({ open: false, cvUrl: null, prospectName: '' })}
            variant="contained"
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Video Preview Dialog */}
      <Dialog
        open={videoPreviewDialog.open}
        onClose={() => setVideoPreviewDialog({ open: false, prospectId: null, prospectName: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VideoIcon />
              <Typography variant="h6">Vidéo - {videoPreviewDialog.prospectName}</Typography>
            </Box>
            <IconButton
              onClick={() => setVideoPreviewDialog({ open: false, prospectId: null, prospectName: '' })}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {videoPreviewDialog.prospectId && (
            <ProspectVideoPlayer prospectId={videoPreviewDialog.prospectId} height="60vh" />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setVideoPreviewDialog({ open: false, prospectId: null, prospectName: '' })}
            variant="contained"
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Ajouter un prospect */}
      <Dialog open={addProspectOpen} onClose={() => setAddProspectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ajouter un candidat potentiel</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Prénom" fullWidth value={prospectForm.firstName}
              onChange={(e) => setProspectForm({ ...prospectForm, firstName: e.target.value })} />
            <TextField label="Nom" fullWidth value={prospectForm.lastName}
              onChange={(e) => setProspectForm({ ...prospectForm, lastName: e.target.value })} />
          </Box>
          <TextField label="Courriel" fullWidth value={prospectForm.email}
            onChange={(e) => setProspectForm({ ...prospectForm, email: e.target.value })} />
          <TextField label="Téléphone" fullWidth value={prospectForm.phone}
            onChange={(e) => setProspectForm({ ...prospectForm, phone: e.target.value })} />
          <TextField label="Ville" fullWidth value={prospectForm.city}
            onChange={(e) => setProspectForm({ ...prospectForm, city: e.target.value })} />
          <TextField label="Adresse" fullWidth value={prospectForm.streetAddress}
            onChange={(e) => setProspectForm({ ...prospectForm, streetAddress: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddProspectOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={onCreateProspect}
            disabled={createPending || !prospectForm.firstName || !prospectForm.phone}
          >
            {createPending ? 'Création…' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      <ContactConflictDialog
        conflict={contactConflict}
        creatingIn="prospect"
        onClose={() => setContactConflict(null)}
      />

      {/* Dialog : transférer prospects vers un client (assignation interne gratuite) */}
      <Dialog
        open={assignClientDialogOpen}
        onClose={() => setAssignClientDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Transférer vers un client</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>{selectedCount}</strong> prospect{selectedCount > 1 ? 's' : ''} seront assigné{selectedCount > 1 ? 's' : ''} au client choisi (assignation interne, gratuit). Le client ne voit pas l'assignation tant qu'elle n'est pas confirmée comme achat.
          </Alert>
          <FormControl fullWidth>
            <InputLabel>Client</InputLabel>
            <Select
              label="Client"
              value={assignClientId}
              onChange={(e) => setAssignClientId(e.target.value)}
            >
              {clients.map((c: any) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignClientDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={onAssignToClient}
            disabled={!assignClientId || assignPending}
          >
            {assignPending ? 'Transfert…' : 'Transférer'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
