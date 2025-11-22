import React, { useState } from 'react';
import {
    IconButton,
    Badge,
    Popover,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    Divider,
    Button,
    Chip,
} from '@mui/material';
import {
    Notifications as NotificationsIcon,
    CheckCircle as CheckCircleIcon,
    Info as InfoIcon,
    Warning as WarningIcon,
    Close as CloseIcon,
} from '@mui/icons-material';

interface Notification {
    id: string;
    type: 'success' | 'info' | 'warning';
    title: string;
    message: string;
    time: string;
    read: boolean;
}

const NotificationCenter: React.FC = () => {
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [notifications, setNotifications] = useState<Notification[]>([
        {
            id: '1',
            type: 'success',
            title: 'Demande soumise avec succès',
            message: 'Votre demande pour Montréal a été reçue. Nous vous contacterons sous 24h.',
            time: 'Il y a 2 heures',
            read: false,
        },
        {
            id: '2',
            type: 'info',
            title: 'Nouveaux candidats disponibles',
            message: '15 nouveaux candidats évalués sont disponibles à Québec.',
            time: 'Il y a 1 jour',
            read: false,
        },
        {
            id: '3',
            type: 'warning',
            title: 'Demande en attente',
            message: 'Votre demande pour Laval nécessite des informations supplémentaires.',
            time: 'Il y a 2 jours',
            read: true,
        },
    ]);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const markAsRead = (id: string) => {
        setNotifications(notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
        ));
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const removeNotification = (id: string) => {
        setNotifications(notifications.filter(n => n.id !== id));
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const open = Boolean(anchorEl);

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircleIcon color="success" />;
            case 'warning':
                return <WarningIcon color="warning" />;
            default:
                return <InfoIcon color="info" />;
        }
    };

    return (
        <>
            <IconButton color="inherit" onClick={handleClick}>
                <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                PaperProps={{
                    sx: { width: 400, maxHeight: 500 },
                }}
            >
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" fontWeight="bold">
                        Notifications
                    </Typography>
                    {unreadCount > 0 && (
                        <Button size="small" onClick={markAllAsRead}>
                            Tout marquer comme lu
                        </Button>
                    )}
                </Box>
                <Divider />

                {notifications.length === 0 ? (
                    <Box p={4} textAlign="center">
                        <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">
                            Aucune notification
                        </Typography>
                    </Box>
                ) : (
                    <List sx={{ p: 0 }}>
                        {notifications.map((notification, index) => (
                            <React.Fragment key={notification.id}>
                                {index > 0 && <Divider />}
                                <ListItem
                                    sx={{
                                        bgcolor: notification.read ? 'transparent' : 'action.hover',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: 'action.selected',
                                        },
                                    }}
                                    onClick={() => markAsRead(notification.id)}
                                    secondaryAction={
                                        <IconButton
                                            edge="end"
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeNotification(notification.id);
                                            }}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    }
                                >
                                    <Box display="flex" gap={1.5} width="100%">
                                        <Box mt={0.5}>{getIcon(notification.type)}</Box>
                                        <Box flex={1}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {notification.title}
                                                </Typography>
                                                {!notification.read && (
                                                    <Chip label="Nouveau" size="small" color="primary" sx={{ height: 20 }} />
                                                )}
                                            </Box>
                                            <Typography variant="body2" color="text.secondary" mb={0.5}>
                                                {notification.message}
                                            </Typography>
                                            <Typography variant="caption" color="text.disabled">
                                                {notification.time}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </ListItem>
                            </React.Fragment>
                        ))}
                    </List>
                )}

                <Divider />
                <Box p={1.5} textAlign="center">
                    <Button size="small" fullWidth onClick={handleClose}>
                        Fermer
                    </Button>
                </Box>
            </Popover>
        </>
    );
};

export default NotificationCenter;
