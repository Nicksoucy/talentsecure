import { useQuery } from '@tanstack/react-query';
import { Alert, AlertTitle, Box, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { peopleSearchService, PeopleSection } from '@/services/peopleSearch.service';

const SECTION_META: Record<PeopleSection, { route: string; label: string }> = {
  employee: { route: '/employees', label: 'Employés' },
  candidate: { route: '/candidates', label: 'Candidats' },
  prospect: { route: '/prospects', label: 'Candidats potentiels' },
};

interface CrossTableHintProps {
  /** Terme de recherche courant. */
  q: string;
  /** Section de la page courante (exclue des suggestions). */
  currentSection: PeopleSection;
  /** N'affiche le bandeau que si activé (typiquement : 0 résultat sur la page courante). */
  enabled?: boolean;
}

/**
 * Bandeau « trouvé ailleurs » : quand une recherche ne donne rien sur la page
 * courante, indique combien de personnes correspondent dans les AUTRES tables
 * (employés / candidats / prospects) avec un lien qui pré-remplit la recherche.
 * Répond au problème « je ne sais pas dans quelle page est la personne ».
 */
export default function CrossTableHint({ q, currentSection, enabled = true }: CrossTableHintProps) {
  const term = q.trim();
  const active = enabled && term.length >= 2;

  const { data } = useQuery({
    queryKey: ['peopleSearchCount', term],
    queryFn: () => peopleSearchService.getCrossTableCounts(term),
    enabled: active,
    staleTime: 60_000,
  });

  if (!active || !data) return null;

  const counts: Record<PeopleSection, number> = {
    employee: data.employees,
    candidate: data.candidates,
    prospect: data.prospects,
  };

  const others = (Object.keys(SECTION_META) as PeopleSection[])
    .filter((s) => s !== currentSection && counts[s] > 0);

  if (others.length === 0) return null;

  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      <AlertTitle>Personne introuvable ici ?</AlertTitle>
      « {term} » correspond à&nbsp;:
      <Box component="span" sx={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', ml: 1 }}>
        {others.map((s) => (
          <Link
            key={s}
            component={RouterLink}
            to={`${SECTION_META[s].route}?q=${encodeURIComponent(term)}`}
            underline="hover"
            fontWeight={600}
          >
            {counts[s]} dans {SECTION_META[s].label} →
          </Link>
        ))}
      </Box>
    </Alert>
  );
}
