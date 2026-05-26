import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconButton, Badge, Popover, Box, Typography, Button, List, ListItem, ListItemButton,
  ListItemText, Divider, Chip, Stack,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { notificationService } from '@/services/notification.service';
import type { AppNotification, NotificationType } from '@/types/notification';

const POLL_MS = 30_000;

/**
 * Cloche de notifications avec badge des non-lues et popover listant les 30 dernières.
 * Polling toutes les 30 secondes via React Query.
 */
export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 30 }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });

  const items: AppNotification[] = data?.data?.items || [];
  const unread = data?.data?.unreadCount || 0;

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleClickNotif = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.link) {
      handleClose();
      navigate(n.link);
    }
  };

  // Sépare les notifs "actions requises" des notifs "info"
  const actionRequired = items.filter((n) => isActionRequired(n.type) && !n.readAt);
  const info = items.filter((n) => !isActionRequired(n.type) || n.readAt);

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} aria-label={`${unread} notifications non lues`}>
        <Badge badgeContent={unread} color="error" max={99}>
          {unread > 0 ? <NotificationsActiveIcon /> : <NotificationsIcon />}
        </Badge>
      </IconButton>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, maxHeight: 600 } } }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Notifications</Typography>
            {unread > 0 && (
              <Button size="small" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                Tout marquer lu
              </Button>
            )}
          </Stack>
          {unread > 0 && (
            <Typography variant="body2" color="text.secondary">{unread} non lue{unread > 1 ? 's' : ''}</Typography>
          )}
        </Box>

        <List dense disablePadding>
          {actionRequired.length > 0 && (
            <>
              <ListItem sx={{ bgcolor: '#fef2f2', py: 0.5 }}>
                <Typography variant="overline" color="error">⚠️ Action requise</Typography>
              </ListItem>
              {actionRequired.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={() => handleClickNotif(n)} />
              ))}
              <Divider />
            </>
          )}
          {info.length > 0 && (
            <>
              {actionRequired.length > 0 && (
                <ListItem sx={{ bgcolor: '#f9fafb', py: 0.5 }}>
                  <Typography variant="overline" color="text.secondary">Informations</Typography>
                </ListItem>
              )}
              {info.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={() => handleClickNotif(n)} />
              ))}
            </>
          )}
          {items.length === 0 && (
            <ListItem>
              <ListItemText
                primary="Aucune notification"
                secondary="Vous êtes à jour !"
                primaryTypographyProps={{ color: 'text.secondary' }}
              />
            </ListItem>
          )}
        </List>
      </Popover>
    </>
  );
}

function NotificationItem({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  return (
    <ListItemButton
      onClick={onClick}
      sx={{
        bgcolor: n.readAt ? 'inherit' : '#eff6ff',
        '&:hover': { bgcolor: n.readAt ? '#f9fafb' : '#dbeafe' },
        alignItems: 'flex-start',
      }}
    >
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" fontWeight={n.readAt ? 400 : 600} sx={{ flex: 1 }}>
              {n.title}
            </Typography>
            <Chip
              label={typeLabel(n.type)}
              size="small"
              color={typeColor(n.type)}
              sx={{ flexShrink: 0, height: 20, fontSize: 10 }}
            />
          </Stack>
        }
        secondary={
          <>
            <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block' }}>
              {n.message}
            </Typography>
            <Typography variant="caption" color="text.disabled" component="span">
              {timeAgo(n.createdAt)}
            </Typography>
          </>
        }
      />
    </ListItemButton>
  );
}

function isActionRequired(t: NotificationType): boolean {
  return [
    'UNIFORM_RETURN_DUE_SOON',
    'UNIFORM_RETURN_OVERDUE',
    'UNIFORM_RETURN_DAMAGED',
    'UNIFORM_WASH_BATCH_RETURNED',
    'UNIFORM_WASH_BATCH_STAGNANT',
    'UNIFORM_LOW_STOCK',
    'UNIFORM_STOCK_ZERO',
    'UNIFORM_TERMINATION_CLOSED',
    'UNIFORM_DEBT_AGING',
    'UNIFORM_SIGNATURE_EXPIRING',
    'UNIFORM_SIGNATURE_EXPIRED',
    'UNIFORM_EMPLOYER_SIGN_PENDING',
  ].includes(t);
}

function typeColor(t: NotificationType): 'default' | 'primary' | 'warning' | 'error' | 'info' | 'success' {
  if (['UNIFORM_RETURN_OVERDUE', 'UNIFORM_STOCK_ZERO', 'UNIFORM_TERMINATION_CLOSED', 'UNIFORM_RETURN_DAMAGED'].includes(t)) return 'error';
  if (['UNIFORM_RETURN_DUE_SOON', 'UNIFORM_LOW_STOCK', 'UNIFORM_WASH_BATCH_STAGNANT', 'UNIFORM_DEBT_AGING'].includes(t)) return 'warning';
  if (['UNIFORM_WASH_BATCH_CREATED', 'UNIFORM_WASH_BATCH_SENT'].includes(t)) return 'info';
  return 'default';
}

const TYPE_LABELS: Record<NotificationType, string> = {
  UNIFORM_RETURN_DAMAGED: 'Retour endommagé',
  UNIFORM_WASH_BATCH_CREATED: 'Lot créé',
  UNIFORM_WASH_BATCH_SENT: 'Lot envoyé',
  UNIFORM_WASH_BATCH_RETURNED: 'Lot revenu',
  UNIFORM_WASH_BATCH_INSPECTED_DAMAGED: 'Inspection',
  UNIFORM_WASH_BATCH_STAGNANT: 'Lot bloqué',
  UNIFORM_RETURN_DUE_SOON: 'Retour bientôt dû',
  UNIFORM_RETURN_OVERDUE: 'Retour en retard',
  UNIFORM_TERMINATION_CLOSED: 'Fin d\'emploi',
  UNIFORM_SETTLEMENT_RECORDED: 'Règlement',
  UNIFORM_DEBT_AGING: 'Dette ancienne',
  UNIFORM_LOW_STOCK: 'Stock bas',
  UNIFORM_STOCK_ZERO: 'Stock à zéro',
  UNIFORM_LEDGER_DRIFT: 'Audit',
  UNIFORM_SIGNATURE_EXPIRING: 'Signature expire',
  UNIFORM_SIGNATURE_EXPIRED: 'Signature expirée',
  UNIFORM_EMPLOYER_SIGN_PENDING: 'Signature employeur',
  UNIFORM_BARCODE_UNKNOWN: 'Code-barres inconnu',
  UNIFORM_INACTIVE_VARIANT_HAS_STOCK: 'Variant inactive',
  UNIFORM_DUPLICATE_ACTIVE_ISSUANCE: 'Doublon remise',
};

function typeLabel(t: NotificationType): string {
  return TYPE_LABELS[t] ?? t;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('fr-CA');
}
