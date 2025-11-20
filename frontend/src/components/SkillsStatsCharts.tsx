import {
  Card,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SkillsStatsChartsProps {
  categoryDistribution: Array<{ category: string; total: number }>;
  levelDistribution: Array<{ level: string; label: string; total: number }>;
  extractionTimeline: Array<{ date: string; total: number }>;
  totalCandidates: number;
}

const LEVEL_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F97316'];
const CATEGORY_COLOR = '#0EA5E9';
const TIMELINE_COLOR = '#6366F1';

export const SkillsStatsCharts = ({
  categoryDistribution,
  levelDistribution,
  extractionTimeline,
  totalCandidates,
}: SkillsStatsChartsProps) => (
  <Grid container spacing={3}>
    <Grid item xs={12} md={6}>
      <Card>
        <CardHeader title="Répartition par catégorie" subheader="Nombre de candidats par compétence" />
        <CardContent sx={{ height: 320 }}>
          {categoryDistribution.length === 0 ? (
            <Typography color="text.secondary">Aucune donnée disponible pour le moment.</Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryDistribution} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartsTooltip formatter={(value: number) => `${value} candidat${value > 1 ? 's' : ''}`} />
                <Bar dataKey="total" fill={CATEGORY_COLOR} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Grid>

    <Grid item xs={12} md={6}>
      <Card>
        <CardHeader title="Niveaux d'expérience" subheader="BEGINNER → EXPERT" />
        <CardContent sx={{ height: 320 }}>
          {levelDistribution.length === 0 ? (
            <Typography color="text.secondary">Les niveaux apparaîtront après la première recherche.</Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={levelDistribution}
                  dataKey="total"
                  nameKey="label"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={4}
                  label={({ percent }) => `${Math.round((percent || 0) * 100)}%`}
                >
                  {levelDistribution.map((entry, index) => (
                    <Cell key={entry.level} fill={LEVEL_COLORS[index % LEVEL_COLORS.length]} />
                  ))}
                </Pie>
                <ChartsTooltip formatter={(value: number, _name, props: any) => [`${value} candidats`, props?.payload?.label]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Grid>

    <Grid item xs={12}>
      <Card>
        <CardHeader
          title="Extractions récentes"
          subheader="Nombre d'extractions sur les 7 derniers jours"
          action={
            <Typography variant="body2" color="text.secondary">
              {totalCandidates} candidat{totalCandidates > 1 ? 's' : ''}
            </Typography>
          }
        />
        <CardContent sx={{ height: 340 }}>
          {extractionTimeline.length === 0 ? (
            <Typography color="text.secondary">Pas encore d'extractions récentes.</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={extractionTimeline} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartsTooltip formatter={(value: number) => `${value} extraction${value > 1 ? 's' : ''}`} />
                <Line type="monotone" dataKey="total" stroke={TIMELINE_COLOR} strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Volume analysé
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
              <Typography variant="h4" fontWeight="bold">
                {totalCandidates}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, totalCandidates)}
                sx={{ flex: 1, height: 8, borderRadius: 4 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);
