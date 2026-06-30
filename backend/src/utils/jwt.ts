import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  // P2-C — version de session : un token n'est valide que si sa version
  // correspond au `tokenVersion` courant de l'utilisateur (révocation au logout).
  tokenVersion?: number;
}

export const generateAccessToken = (payload: JWTPayload): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET n\'est pas défini');
  }

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: JWTPayload): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET n\'est pas défini');
  }

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as string,
  } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): JWTPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET n\'est pas défini');
  }

  return jwt.verify(token, secret) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET n\'est pas défini');
  }

  return jwt.verify(token, secret) as JWTPayload;
};
