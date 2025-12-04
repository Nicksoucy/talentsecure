import { useQuery } from '@tanstack/react-query';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import {
    Card,
    CardContent,
    Typography,
    Grid,
    Box,
    CircularProgress,
    useTheme,
} from '@mui/material';
import { skillsService } from '@/services/skills.service';
import { useAuth } from '@/context/AuthContext';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const SkillsDistributionCharts = () => {
    const { accessToken } = useAuth();
    const theme = useTheme();

    const { data, isLoading, error } = useQuery({
        queryKey: ['prospectSkillsDistribution'],
        queryFn: () => skillsService.getProspectSkillsDistribution(accessToken!),
        enabled: !!accessToken,
    });

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
            </Box>
        );
    }

    if (error || !data) {
        return null; // Don't show anything if error or no data
    }

    const { topSkills, levelDistribution } = data;

    // Format data for Pie Chart
    const pieData = levelDistribution.map((item: any) => ({
        name: item.level,
        value: item.count,
    }));

    return (
        <Grid container spacing={3} mb={4}>
            {/* Top 10 Skills Bar Chart */}
            <Grid item xs={12} md={8}>
                <Card sx={{ height: '100%' }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            Top 10 Compétences Extraites
                        </Typography>
                        <Box height={300}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topSkills}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={100} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: theme.palette.background.paper }}
                                    />
                                    <Legend />
                                    <Bar dataKey="count" name="Candidats" fill="#8884d8" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    </CardContent>
                </Card>
            </Grid>

            {/* Level Distribution Pie Chart */}
            <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            Répartition par Niveau
                        </Typography>
                        <Box height={300}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {pieData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </Box>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
};

export default SkillsDistributionCharts;
