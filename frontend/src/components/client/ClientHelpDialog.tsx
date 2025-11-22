import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    Button,
} from '@mui/material';
import {
    Close as CloseIcon,
    ExpandMore as ExpandMoreIcon,
    Help as HelpIcon,
    CheckCircle as CheckCircleIcon,
    Info as InfoIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    WhatsApp as WhatsAppIcon,
} from '@mui/icons-material';

interface HelpDialogProps {
    open: boolean;
    onClose: () => void;
}

const ClientHelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
    const [expanded, setExpanded] = useState<string | false>('faq1');

    const handleChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
        setExpanded(isExpanded ? panel : false);
    };

    const faqs = [
        {
            id: 'faq1',
            question: 'Comment fonctionne le processus de demande?',
            answer: `1. Parcourez la carte et sélectionnez les villes qui vous intéressent
2. Choisissez entre candidats évalués (premium) ou CVs seulement (économique)
3. Ajoutez vos sélections au panier
4. Soumettez votre demande
5. Nous vous contacterons sous 24-48h pour confirmer et organiser les entrevues`,
        },
        {
            id: 'faq2',
            question: 'Quelle est la différence entre "Candidats Évalués" et "CVs Seulement"?',
            answer: `Candidats Évalués (15-45$):
• Déjà interviewés par nos recruteurs
• Vidéo d'entrevue disponible
• Évaluations complètes et notes RH
• Prêts à l'embauche immédiatement

CVs Seulement (5-10$):
• CVs vérifiés et qualifiés
• Vous faites l'entrevue vous-même
• Option économique
• Parfait pour les entreprises avec équipe RH interne`,
        },
        {
            id: 'faq3',
            question: 'Comment sont calculés les prix?',
            answer: `Les prix varient selon:
• La ville/région (demande locale)
• Le type de candidat (évalué vs CV seulement)
• La quantité demandée

Les prix affichés sont des estimations. Le prix final sera confirmé lors de la validation de votre demande.`,
        },
        {
            id: 'faq4',
            question: 'Puis-je modifier ma demande après soumission?',
            answer: `Une fois soumise, votre demande ne peut plus être modifiée directement. Cependant, vous pouvez:
• Nous contacter immédiatement pour des ajustements
• Créer une nouvelle demande
• Annuler et recommencer (avant traitement)`,
        },
        {
            id: 'faq5',
            question: 'Combien de temps pour recevoir les candidats?',
            answer: `Délais typiques:
• Confirmation de demande: 24-48h
• Envoi des profils: 2-5 jours ouvrables
• Organisation des entrevues: selon votre disponibilité

Pour les demandes urgentes, contactez-nous directement.`,
        },
    ];

    const howItWorks = [
        {
            step: 1,
            title: 'Explorez la carte',
            description: 'Visualisez les candidats disponibles par ville',
        },
        {
            step: 2,
            title: 'Sélectionnez vos besoins',
            description: 'Choisissez le type et la quantité de candidats',
        },
        {
            step: 3,
            title: 'Ajoutez au panier',
            description: 'Consultez le total et ajoutez des notes',
        },
        {
            step: 4,
            title: 'Soumettez',
            description: 'Envoyez votre demande en un clic',
        },
        {
            step: 5,
            title: 'Recevez vos candidats',
            description: 'Nous vous contactons sous 24-48h',
        },
    ];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center" gap={1}>
                        <HelpIcon color="primary" />
                        <Typography variant="h6" fontWeight="bold">
                            Centre d'aide
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent>
                {/* How it works */}
                <Box mb={3}>
                    <Typography variant="h6" gutterBottom fontWeight="bold" color="primary">
                        Comment ça marche?
                    </Typography>
                    <List>
                        {howItWorks.map((item) => (
                            <ListItem key={item.step} sx={{ py: 1 }}>
                                <ListItemIcon>
                                    <Chip
                                        label={item.step}
                                        color="primary"
                                        size="small"
                                        sx={{ fontWeight: 'bold', minWidth: 32 }}
                                    />
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.title}
                                    secondary={item.description}
                                    primaryTypographyProps={{ fontWeight: 'bold' }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* FAQ */}
                <Box mb={3}>
                    <Typography variant="h6" gutterBottom fontWeight="bold" color="primary">
                        Questions fréquentes
                    </Typography>
                    {faqs.map((faq) => (
                        <Accordion
                            key={faq.id}
                            expanded={expanded === faq.id}
                            onChange={handleChange(faq.id)}
                            elevation={1}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography fontWeight="bold">{faq.question}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                                    {faq.answer}
                                </Typography>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Contact Support */}
                <Box>
                    <Typography variant="h6" gutterBottom fontWeight="bold" color="primary">
                        Besoin d'aide supplémentaire?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Notre équipe est là pour vous aider!
                    </Typography>
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Button
                            variant="outlined"
                            startIcon={<PhoneIcon />}
                            href="tel:+15145551234"
                            fullWidth
                        >
                            (514) 555-1234
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<EmailIcon />}
                            href="mailto:support@securitexguard.com"
                            fullWidth
                        >
                            support@securitexguard.com
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<WhatsAppIcon />}
                            color="success"
                            fullWidth
                        >
                            WhatsApp: (514) 555-1234
                        </Button>
                    </Box>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default ClientHelpDialog;
