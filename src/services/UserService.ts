import crypto from 'crypto';
import { promisify } from 'util';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { jwtService, TokenPair } from './JwtService.js';

const pbkdf2 = promisify(crypto.pbkdf2);

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  role: string;
  email_verified: boolean;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  role: string;
  email_verified: boolean;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  display_name?: string;
}

export interface UpdateUserInput {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

export interface LoginInput {
  email?: string;
  username?: string;
  password: string;
}

export class UserService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  static async create(db: DatabaseClient): Promise<UserService> {
    return new UserService(db);
  }

  async register(input: CreateUserInput): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const { email, username, password, display_name } = input;

    const existingUser = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 OR username = $2`,
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email or username already exists');
    }

    const passwordHash = await this.hashPassword(password);

    const result = await this.db.query<User>(
      `INSERT INTO users (email, username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING *`,
      [email, username, passwordHash, display_name || username]
    );

    const user = result.rows[0]!;
    const publicUser = this.toPublicUser(user);
    const tokens = jwtService.createTokenPair(user.id, user.email, user.role);

    await this.createSession(user.id, tokens.refreshToken);

    logger.info(`[UserService] New user registered: ${user.email}`);

    return { user: publicUser, tokens };
  }

  async login(input: LoginInput): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const { email, username, password } = input;

    const identifier = email || username;
    if (!identifier) {
      throw new Error('Email or username is required');
    }

    const result = await this.db.query<User>(
      `SELECT * FROM users WHERE (email = $1 OR username = $1) AND is_active = true`,
      [identifier]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0]!;
    const passwordValid = await this.verifyPassword(password, user.password_hash!);

    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const tokens = jwtService.createTokenPair(user.id, user.email, user.role);

    await this.db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    await this.createSession(user.id, tokens.refreshToken);

    logger.info(`[UserService] User logged in: ${user.email}`);

    const publicUser = this.toPublicUser(user);
    return { user: publicUser, tokens };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = jwtService.hashToken(refreshToken);
      await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1 AND token_hash = $2`, [
        userId,
        tokenHash,
      ]);
    } else {
      await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
    }

    logger.info(`[UserService] User logged out: ${userId}`);
  }

  async getProfile(userId: string): Promise<PublicUser | null> {
    const result = await this.db.query<User>(
      `SELECT id, email, username, display_name, avatar_url, bio, role, 
              email_verified, is_active, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rows[0]) return null;
    return this.toPublicUser(result.rows[0]);
  }

  async updateProfile(userId: string, input: UpdateUserInput): Promise<PublicUser> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(input.display_name);
    }

    if (input.avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(input.avatar_url);
    }

    if (input.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(input.bio);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await this.db.query<User>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error('User not found');
    }

    logger.info(`[UserService] Profile updated: ${userId}`);

    return this.toPublicUser(result.rows[0]);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const result = await this.db.query<User>(`SELECT password_hash FROM users WHERE id = $1`, [
      userId,
    ]);

    if (!result.rows[0]) {
      throw new Error('User not found');
    }

    const passwordValid = await this.verifyPassword(currentPassword, result.rows[0].password_hash!);

    if (!passwordValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await this.hashPassword(newPassword);

    await this.db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      newPasswordHash,
      userId,
    ]);

    await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);

    logger.info(`[UserService] Password changed: ${userId}`);
  }

  async requestPasswordReset(email: string): Promise<string> {
    const result = await this.db.query<User>(`SELECT id FROM users WHERE email = $1`, [email]);

    if (!result.rows[0]) {
      return '';
    }

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = jwtService.hashToken(token);
    const expiresAt = new Date(Date.now() + 3600000);

    await this.db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    logger.info(`[UserService] Password reset requested: ${email}`);

    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = jwtService.hashToken(token);

    const result = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM password_resets 
       WHERE token_hash = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tokenHash]
    );

    if (!result.rows[0]) {
      throw new Error('Invalid or expired token');
    }

    const userId = result.rows[0].user_id;
    const passwordHash = await this.hashPassword(newPassword);

    await this.db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      passwordHash,
      userId,
    ]);

    await this.db.query(`UPDATE password_resets SET used = true WHERE user_id = $1`, [userId]);

    await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);

    logger.info(`[UserService] Password reset completed: ${userId}`);
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const tokenHash = jwtService.hashToken(refreshToken);

    const result = await this.db.query<{ user_id: string; expires_at: Date }>(
      `SELECT user_id, expires_at FROM user_sessions 
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!result.rows[0]) {
      throw new Error('Invalid or expired refresh token');
    }

    const userId = result.rows[0].user_id;

    const user = await this.getProfile(userId);

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    const tokens = jwtService.createTokenPair(user.id, user.email, user.role);

    await this.db.query(`DELETE FROM user_sessions WHERE token_hash = $1`, [tokenHash]);

    await this.createSession(user.id, tokens.refreshToken);

    return tokens;
  }

  private toPublicUser(user: User): PublicUser {
    const { password_hash, updated_at, ...publicUser } = user;
    return publicUser as Omit<User, 'password_hash' | 'updated_at'> as PublicUser;
  }

  private async createSession(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = jwtService.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + jwtService.getRefreshTokenExpiry() * 1000);

    await this.db.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await pbkdf2(password, salt, 100000, 64, 'sha512');
    return `${salt}:${hash.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    if (!salt) return false;
    const verifyHash = await pbkdf2(password, salt, 100000, 64, 'sha512');
    return hash === verifyHash.toString('hex');
  }
}
