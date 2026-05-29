import { ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Skeleton, Chip } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  /** Petit libellé sous la valeur (ex: "9.5+ /10", "408 / 1312"). */
  subtitle?: string;
  /** Chip de tendance (ex: "+3 cette semaine"). Vert si > 0. */
  trend?: { label: string; positive?: boolean };
  loading?: boolean;
  onClick?: () => void;
}

/**
 * Carte KPI réutilisable du tableau de bord : pastille d'icône teintée,
 * grand nombre, libellé, et chip de tendance optionnel.
 */
export default function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  trend,
  loading,
  onClick,
}: StatCardProps) {
  return (
    <Card
      onClick={onClick}
      sx={{
        height: '100%',
        borderRadius: 3,
        transition: 'transform .15s ease, box-shadow .15s ease',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 4 } : undefined,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              backgroundColor: `${color}1A`, // ~10% opacity
            }}
          >
            {icon}
          </Box>
          {trend && !loading && (
            <Chip
              size="small"
              icon={trend.positive !== false ? <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : undefined}
              label={trend.label}
              color={trend.positive !== false ? 'success' : 'default'}
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          )}
        </Box>

        {loading ? (
          <Skeleton variant="text" width={80} height={48} />
        ) : (
          <Typography variant="h4" fontWeight="bold" lineHeight={1.1}>
            {value}
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
