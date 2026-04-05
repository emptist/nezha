import { Request, Response, NextFunction } from 'express';
import { JwtService } from './jwt';

export class AuthMiddleware {
  private jwtService: JwtService;

  constructor() {
    this.jwtService = new JwtService();
  }

  verify(req: Request): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.substring(7);
    try {
      return this.jwtService.verify(token) !== null;
    } catch {
      return false;
    }
  }

  generateToken(userId: string, roles: string[]): string {
    return this.jwtService.sign({ userId, roles });
  }
}
