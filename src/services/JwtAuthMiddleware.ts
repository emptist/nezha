import { DatabaseClient } from '../db/DatabaseClient.js';
import { jwtService } from './JwtService.js';

export interface JwtAuthResult {
  authorized: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class JwtAuthMiddleware {
  private db?: DatabaseClient;
  private excludePaths: string[];

  constructor(db?: DatabaseClient, excludePaths: string[] = []) {
    this.db = db;
    this.excludePaths = [
      '/health',
      '/api/users/register',
      '/api/users/login',
      '/api/users/refresh',
      '/api/users/password-reset',
      '/api/users/reset-password',
      ...excludePaths,
    ];
  }

  setDatabase(db: DatabaseClient): void {
    this.db = db;
  }

  isExcluded(pathname: string): boolean {
    return this.excludePaths.some(excluded => pathname.startsWith(excluded));
  }

  async authenticate(request: Request): Promise<JwtAuthResult> {
    if (this.isExcluded(request.url)) {
      return { authorized: true };
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authorized: false, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.slice(7);

    const payload = jwtService.verifyToken(token);

    if (!payload) {
      return { authorized: false, error: 'Invalid or expired token' };
    }

    return {
      authorized: true,
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      },
    };
  }

  requireRole(roles: string[]): (authResult: JwtAuthResult) => boolean {
    return (authResult: JwtAuthResult) => {
      if (!authResult.authorized) {
        return false;
      }
      return authResult.user ? roles.includes(authResult.user.role) : false;
    };
  }

  requireAdmin(authResult: JwtAuthResult): boolean {
    return this.requireRole(['admin', 'superadmin'])(authResult);
  }

  requireSuperadmin(authResult: JwtAuthResult): boolean {
    return authResult.authorized && authResult.user?.role === 'superadmin';
  }
}

export const createJwtAuthMiddleware = (db?: DatabaseClient): JwtAuthMiddleware => {
  return new JwtAuthMiddleware(db);
};
