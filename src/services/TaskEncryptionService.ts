import { DatabaseClient } from '../db/DatabaseClient.js';
import {
  EncryptionService,
  getEncryptionService,
  containsSensitiveData,
  encryptSensitiveFields,
  decryptSensitiveFields,
} from './EncryptionService.js';
import { logger } from '../utils/logger.js';
import { TASK_STATUS } from '../config/constants.js';
import type { TaskStatus } from '../config/types.js';

export interface TaskResult {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  result?: Record<string, unknown>;
  encryptedResult?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskQueryOptions {
  includeDecrypted?: boolean;
  userRole?: string;
}

export class TaskEncryptionService {
  private readonly db: DatabaseClient;
  private readonly encryption: EncryptionService;
  private static instance: TaskEncryptionService | null = null;

  private constructor(db: DatabaseClient, encryption: EncryptionService) {
    this.db = db;
    this.encryption = encryption;
  }

  static getInstance(db: DatabaseClient): TaskEncryptionService {
    if (!TaskEncryptionService.instance) {
      TaskEncryptionService.instance = new TaskEncryptionService(db, getEncryptionService());
    }
    return TaskEncryptionService.instance;
  }

  async storeTaskResult(taskId: string, result: Record<string, unknown>): Promise<void> {
    if (!process.env.NEZHA_SECRET) {
      await this.storeTaskResultPlain(taskId, result);
      return;
    }

    const hasSensitive = containsSensitiveData(result);

    if (!hasSensitive) {
      await this.storeTaskResultPlain(taskId, result);
      return;
    }

    const encrypted = encryptSensitiveFields(result, this.encryption);

    await this.db.query(
      `UPDATE tasks SET 
        result = $1, 
        encrypted_result = $2, 
        result_iv = $3, 
        result_tag = $4, 
        result_salt = $5,
        encrypted_at = NOW(),
        updated_at = NOW()
       WHERE id = $6`,
      [null, JSON.stringify(encrypted), null, null, null, taskId]
    );

    logger.debug(`Task ${taskId} result stored with encrypted sensitive fields`);
  }

  private async storeTaskResultPlain(
    taskId: string,
    result: Record<string, unknown>
  ): Promise<void> {
    await this.db.query(`UPDATE tasks SET result = $1, updated_at = NOW() WHERE id = $2`, [
      JSON.stringify(result),
      taskId,
    ]);
  }

  async getTaskResult(
    taskId: string,
    userRole: string = 'user'
  ): Promise<Record<string, unknown> | null> {
    const task = await this.db.query<{
      result: string | null;
      encrypted_result: string | null;
      result_iv: string | null;
      result_tag: string | null;
      result_salt: string | null;
      status: TaskStatus;
    }>(
      `SELECT result, encrypted_result, result_iv, result_tag, result_salt, status 
       FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (task.rows.length === 0) {
      return null;
    }

    const row = task.rows[0];
    if (!row) {
      return null;
    }

    if (!process.env.NEZHA_SECRET) {
      return row.result ? JSON.parse(row.result) : null;
    }

    if (row.encrypted_result) {
      if (!this.checkAccessPermission(userRole, taskId)) {
        logger.warn(`User role '${userRole}' denied access to task ${taskId} result`);
        return null;
      }

      try {
        const encrypted = JSON.parse(row.encrypted_result as string);
        return decryptSensitiveFields(encrypted, this.encryption);
      } catch (error) {
        logger.error(`Failed to decrypt task ${taskId} result:`, error);
        return null;
      }
    }

    return row.result ? JSON.parse(row.result) : null;
  }

  private checkAccessPermission(userRole: string, taskId: string): boolean {
    if (userRole === 'admin' || userRole === 'superadmin') {
      return true;
    }
    logger.warn(`User role '${userRole}' denied access to decrypt task ${taskId}`);
    return false;
  }

  async completeTaskWithEncryption(taskId: string, result: Record<string, unknown>): Promise<void> {
    await this.storeTaskResult(taskId, result);
    await this.db.query(
      `UPDATE tasks SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [TASK_STATUS.COMPLETED, taskId]
    );
  }

  async failTaskWithEncryption(taskId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE tasks SET status = $1, error = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [TASK_STATUS.FAILED, error, taskId]
    );
  }
}

export const getTaskEncryptionService = (db: DatabaseClient): TaskEncryptionService => {
  return TaskEncryptionService.getInstance(db);
};
