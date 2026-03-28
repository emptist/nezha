import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export class JwtService {
  private secret: string;
  private expiresIn: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  sign(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  verify(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, this.secret) as JwtPayload;
    } catch {
      return null;
    }
  }

  refresh(token: string): string | null {
    const payload = this.verify(token);
    if (!payload) return null;
    return this.sign({ userId: payload.userId, roles: payload.roles });
  }
}
