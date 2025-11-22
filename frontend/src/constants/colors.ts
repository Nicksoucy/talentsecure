// Enhanced color palette for candidate types and status
export const candidateColors = {
    evaluated: {
        main: '#1976d2',
        light: '#42a5f5',
        dark: '#1565c0',
        gradient: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
        bg: '#e3f2fd',
        border: '#90caf9',
    },
    cvOnly: {
        main: '#ff9800',
        light: '#ffb74d',
        dark: '#f57c00',
        gradient: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
        bg: '#fff3e0',
        border: '#ffcc80',
    },
    success: {
        main: '#4caf50',
        light: '#81c784',
        dark: '#388e3c',
        gradient: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)',
        bg: '#e8f5e9',
    },
    warning: {
        main: '#ff9800',
        light: '#ffb74d',
        dark: '#f57c00',
        gradient: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
        bg: '#fff3e0',
    },
    error: {
        main: '#f44336',
        light: '#e57373',
        dark: '#d32f2f',
        gradient: 'linear-gradient(135deg, #f44336 0%, #e57373 100%)',
        bg: '#ffebee',
    },
    info: {
        main: '#2196f3',
        light: '#64b5f6',
        dark: '#1976d2',
        gradient: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
        bg: '#e3f2fd',
    },
};

// Status colors
export const statusColors = {
    draft: {
        main: '#9e9e9e',
        bg: '#f5f5f5',
        text: '#616161',
    },
    pending: {
        main: '#ff9800',
        bg: '#fff3e0',
        text: '#e65100',
    },
    approved: {
        main: '#4caf50',
        bg: '#e8f5e9',
        text: '#2e7d32',
    },
    rejected: {
        main: '#f44336',
        bg: '#ffebee',
        text: '#c62828',
    },
    completed: {
        main: '#2196f3',
        bg: '#e3f2fd',
        text: '#1565c0',
    },
};

// Semantic colors for UI elements
export const uiColors = {
    primary: '#1976d2',
    secondary: '#f50057',
    background: {
        default: '#f5f5f5',
        paper: '#ffffff',
        dark: '#121212',
    },
    text: {
        primary: '#212121',
        secondary: '#757575',
        disabled: '#9e9e9e',
    },
    divider: '#e0e0e0',
    overlay: 'rgba(0, 0, 0, 0.5)',
};

// Gradient backgrounds
export const gradients = {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    info: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    dark: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)',
    premium: 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
    economy: 'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
};

// Shadow presets
export const shadows = {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    glow: '0 0 15px rgba(25, 118, 210, 0.5)',
};

export default {
    candidateColors,
    statusColors,
    uiColors,
    gradients,
    shadows,
};
