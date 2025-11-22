import React from 'react';
import { Box, Typography, Paper, SxProps, Theme } from '@mui/material';
import { animations, transitions } from '@/utils/animations';
import { candidateColors } from '@/constants/colors';

interface IconSectionProps {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
    gradient?: boolean;
    elevation?: number;
    sx?: SxProps<Theme>;
}

const IconSection: React.FC<IconSectionProps> = ({
    icon,
    title,
    subtitle,
    children,
    color = 'primary',
    gradient = false,
    elevation = 2,
    sx,
}) => {
    const getColorStyles = () => {
        const colorMap = {
            primary: candidateColors.evaluated,
            secondary: candidateColors.cvOnly,
            success: candidateColors.success,
            warning: candidateColors.warning,
            error: candidateColors.error,
            info: candidateColors.info,
        };

        const colors = colorMap[color];

        return {
            iconBg: gradient ? colors.gradient : colors.main,
            borderColor: colors.border,
            bgColor: colors.bg,
        };
    };

    const styles = getColorStyles();

    return (
        <Paper
            elevation={elevation}
            sx={{
                p: 2,
                borderLeft: 4,
                borderColor: styles.borderColor,
                transition: transitions.default,
                animation: animations.fadeIn,
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                },
                ...sx,
            }}
        >
            <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
                <Box
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        background: styles.iconBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        flexShrink: 0,
                        animation: animations.scaleIn,
                        '& svg': {
                            fontSize: '1.5rem',
                        },
                    }}
                >
                    {icon}
                </Box>
                <Box flex={1}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography variant="body2" color="text.secondary">
                            {subtitle}
                        </Typography>
                    )}
                </Box>
            </Box>
            <Box>{children}</Box>
        </Paper>
    );
};

export default IconSection;
