import { Chip, MenuItem, Stack, TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import TrafficIcon from '@mui/icons-material/Traffic';
import type { EmployeeDivision } from '@/types';

/**
 * Métier d'un employé : agent de sécurité, signaleur, ou les deux.
 * Le signaleur ressort en orange (couleur des dossards) pour qu'on le
 * distingue d'un coup d'œil d'un agent de sécurité.
 */
export type DivisionChoice = 'SECURITE' | 'SIGNALISATION' | 'LES_DEUX';

export const DIVISION_CHOICES: { value: DivisionChoice; label: string }[] = [
  { value: 'SECURITE', label: 'Agent de sécurité' },
  { value: 'SIGNALISATION', label: 'Signaleur' },
  { value: 'LES_DEUX', label: 'Agent de sécurité et signaleur' },
];

/** Liste de métiers (API) → choix unique du formulaire. Absent/vide → agent de sécurité. */
export function choiceFromDivisions(divisions?: EmployeeDivision[] | null): DivisionChoice {
  const sec = !divisions?.length || divisions.includes('SECURITE');
  const sig = !!divisions?.includes('SIGNALISATION');
  if (sec && sig) return 'LES_DEUX';
  return sig ? 'SIGNALISATION' : 'SECURITE';
}

/** Choix du formulaire → liste de métiers envoyée à l'API. */
export function divisionsFromChoice(choice: DivisionChoice): EmployeeDivision[] {
  if (choice === 'LES_DEUX') return ['SECURITE', 'SIGNALISATION'];
  return [choice];
}

/** Vrai si l'employé est signaleur SEULEMENT (pas aussi agent de sécurité). */
export const isFlaggerOnly = (divisions?: EmployeeDivision[] | null) =>
  choiceFromDivisions(divisions) === 'SIGNALISATION';

export function DivisionChips({
  divisions,
  size = 'small',
}: {
  divisions?: EmployeeDivision[] | null;
  size?: 'small' | 'medium';
}) {
  const choice = choiceFromDivisions(divisions);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
      {choice !== 'SIGNALISATION' && (
        <Chip
          icon={<ShieldIcon />}
          label="Agent de sécurité"
          size={size}
          variant="outlined"
          color="primary"
        />
      )}
      {choice !== 'SECURITE' && (
        <Chip icon={<TrafficIcon />} label="Signaleur" size={size} color="warning" />
      )}
    </Stack>
  );
}

export function DivisionSelect({
  value,
  onChange,
  ...props
}: { value: DivisionChoice; onChange: (choice: DivisionChoice) => void } & Omit<
  TextFieldProps,
  'value' | 'onChange' | 'select'
>) {
  return (
    <TextField
      select
      label="Métier"
      value={value}
      onChange={(e) => onChange(e.target.value as DivisionChoice)}
      {...props}
    >
      {DIVISION_CHOICES.map((c) => (
        <MenuItem key={c.value} value={c.value}>
          {c.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
