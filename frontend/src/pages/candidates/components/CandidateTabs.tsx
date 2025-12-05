import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, Badge } from '@mui/material';
import {
    Person as PersonIcon,
    Work as WorkIcon,
    Description as DescriptionIcon,
    Star as StarIcon,
} from '@mui/icons-material';

interface CandidateTabsProps {
    children: React.ReactNode;
    value: number;
    onChange: (event: React.SyntheticEvent, newValue: number) => void;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`candidate-tabpanel-${index}`}
            aria-labelledby={`candidate-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ py: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

function a11yProps(index: number) {
    return {
        id: `candidate-tab-${index}`,
        'aria-controls': `candidate-tabpanel-${index}`,
    };
}

export default function CandidateTabs({ value, onChange, children }: CandidateTabsProps) {
    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={value} onChange={onChange} aria-label="candidate details tabs">
                    <Tab icon={<PersonIcon />} iconPosition="start" label="Vue d'ensemble" {...a11yProps(0)} />
                    <Tab icon={<WorkIcon />} iconPosition="start" label="Expérience & Compétences" {...a11yProps(1)} />
                    <Tab icon={<DescriptionIcon />} iconPosition="start" label="Documents & Média" {...a11yProps(2)} />
                    <Tab icon={<StarIcon />} iconPosition="start" label="Évaluation" {...a11yProps(3)} />
                </Tabs>
            </Box>
            {children}
        </Box>
    );
}

export { CustomTabPanel };
