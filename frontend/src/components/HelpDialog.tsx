import { useState, ReactNode } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
  Tooltip,
} from '@mui/material';
import { HelpOutline, InfoOutlined, Close as CloseIcon } from '@mui/icons-material';

export interface HelpDialogSection {
  title: string;
  description?: string;
  bullets?: string[];
  icon?: ReactNode;
}

export interface HelpDialogProps {
  title: string;
  subtitle?: string;
  sections?: HelpDialogSection[];
  faq?: Array<{ question: string; answer: string }>;
  quickTips?: string[];
  triggerLabel?: string;
  buttonVariant?: 'text' | 'outlined' | 'contained';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

const sizeToMaxWidth: Record<NonNullable<HelpDialogProps['size']>, 'xs' | 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

export const HelpDialog = ({
  title,
  subtitle,
  sections,
  faq,
  quickTips,
  triggerLabel = 'Aide',
  buttonVariant = 'outlined',
  size = 'md',
  icon,
}: HelpDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="Afficher l'aide et les astuces">
        <Button
          variant={buttonVariant}
          startIcon={icon || <HelpOutline />}
          onClick={() => setOpen(true)}
          size="small"
        >
          {triggerLabel}
        </Button>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth={sizeToMaxWidth[size]} fullWidth>
        <DialogTitle sx={{ pr: 5 }}>
          <Stack spacing={0.5}>
            <Typography variant="h6" fontWeight="bold">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Stack>
          <IconButton
            aria-label="Fermer l'aide"
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            {sections?.map((section) => (
              <Box key={section.title}>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <InfoOutlined fontSize="small" color="primary" />
                  <Typography variant="subtitle1" fontWeight="bold">
                    {section.title}
                  </Typography>
                </Stack>
                {section.description && (
                  <Typography variant="body2" color="text.secondary" mb={1}>
                    {section.description}
                  </Typography>
                )}
                {section.bullets && section.bullets.length > 0 && (
                  <List dense>
                    {section.bullets.map((bullet) => (
                      <ListItem key={bullet} sx={{ py: 0 }}>
                        <ListItemIcon sx={{ minWidth: 24 }}>
                          <HelpOutline fontSize="small" color="disabled" />
                        </ListItemIcon>
                        <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={bullet} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            ))}

            {faq && faq.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Questions fréquentes
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Stack spacing={1.5}>
                  {faq.map((item) => (
                    <Box key={item.question}>
                      <Typography variant="subtitle2">{item.question}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.answer}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {quickTips && quickTips.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Astuces rapides
                </Typography>
                <List dense>
                  {quickTips.map((tip) => (
                    <ListItem key={tip} sx={{ py: 0 }}>
                      <ListItemIcon sx={{ minWidth: 24 }}>
                        <InfoOutlined fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={tip} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
