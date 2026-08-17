import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'anon_super_secret_jwt_key_development_32chars_long_xyz';
}

const SESSION_EXPIRY = '24h';

export interface SessionPayload {
  identity_id: string;
  is_fixed: boolean;
  iat?: number;
  exp?: number;
}

export function signSessionToken(identityId: string, isFixed = false): string {
  return jwt.sign(
    {
      identity_id: identityId,
      is_fixed: isFixed,
    },
    getJwtSecret(),
    {
      expiresIn: SESSION_EXPIRY,
    }
  );
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as SessionPayload;
    return decoded;
  } catch {
    return null;
  }
}
