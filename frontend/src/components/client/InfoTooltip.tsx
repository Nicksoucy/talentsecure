import React from 'react';
import { Tooltip, Box, Typography, Divider } from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';

interface InfoTooltipProps {
    title: string;
    content: string | string[];
    pricing?: {
        min: string;
        max: string;
    };
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ title, content, pricing }) => {
    return (
        <Tooltip
            title={
                <Box sx={{ p: 1 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        {title}
                    </Typography>
                    {Array.isArray(content) ? (
                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                            {content.map((item, index) => (
                                <Typography component="li" key={index} variant="caption" display="block">
                                    {item}
                                </Typography>
                            ))}
                        </Box>
                    ) : (
                        <Typography variant="caption">{content}</Typography>
                    )}
                    {pricing && (
                        <>
                            <Divider sx={{ my: 0.5 }} />
                            <Typography variant="caption" fontWeight="bold" display="block">
                                Prix: {pricing.min}$ - {pricing.max}$
                            </Typography>
                        </>
                    )}
                </Box>
            }
            arrow
            placement="top"
        >
            <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help', ml: 0.5 }} />
        </Tooltip>
    );
};

// Pre-configured tooltips for common use cases
export const CandidateTypeTooltips = {
    evaluated: (
        <InfoTooltip
            title="Candidats Évalués (Premium)"
            content={[
                'Déjà interviewés par nos recruteurs professionnels',
                'Vidéo d\'entrevue disponible pour visionnement',
                'Évaluations complètes et notes RH détaillées',
                'Vérifications de références effectuées',
                'Prêts à l\'embauche immédiatement',
            ]}
            pricing={{ min: '15', max: '45' }}
        />
    ),
    cvOnly: (
        <InfoTooltip
            title="CVs Seulement (Économique)"
            content={[
                'CVs vérifiés et qualifiés',
                'Vous effectuez l\'entrevue vous-même',
                'Option économique pour entreprises avec équipe RH',
                'Candidats pré-sélectionnés selon vos critères',
                'Parfait pour économiser sur les coûts de recrutement',
            ]}
            pricing={{ min: '5', max: '10' }}
        />
    ),
};

export const PricingTooltip: React.FC<{ city: string }> = ({ city }) => (
    <InfoTooltip
        title={`Tarification pour ${city}`}
        content={[
            'Les prix varient selon la demande locale',
            'Prix plus élevés dans les grandes villes',
            'Rabais disponibles pour commandes en volume',
            'Prix final confirmé lors de la validation',
        ]}
    />
);

export default InfoTooltip;
