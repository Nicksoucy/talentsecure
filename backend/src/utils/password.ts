import bcrypt from 'bcryptjs';

// S14 (audit) — 12 rounds (recommandation actuelle). Les hash existants en 10
// restent valides (bcrypt encode le coût dans le hash) ; seuls les nouveaux
// mots de passe utilisent 12.
const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};
