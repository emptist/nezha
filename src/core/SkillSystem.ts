import {
  databaseSkillLoader,
  type StoredSkill,
  type SkillExecutionContext,
} from '../services/DatabaseSkillLoader.js';
import { logger } from '../utils/logger.js';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  execute: (input: unknown) => Promise<unknown>;
}

export interface SkillExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  skillId: string;
  skillName: string;
  durationMs: number;
}

export class SkillSystem {
  private dbClient: unknown = null;
  private initialized: boolean = false;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
    databaseSkillLoader.setDatabaseClient(client);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.dbClient) {
      await databaseSkillLoader.refreshCache();
    }

    this.initialized = true;
    logger.info('[SkillSystem] Initialized with DB-only skill loading');
  }

  async refreshSkills(): Promise<void> {
    databaseSkillLoader.invalidateCache();
    await databaseSkillLoader.refreshCache();
    logger.info('[SkillSystem] Skills cache refreshed');
  }

  async getSkill(name: string, context?: SkillExecutionContext): Promise<Skill | null> {
    const stored = await databaseSkillLoader.getSkillByName(name, context);
    if (!stored) return null;

    return this.createSkillFromStored(stored);
  }

  async getSkillById(id: string, context?: SkillExecutionContext): Promise<Skill | null> {
    const stored = await databaseSkillLoader.getSkill(id, context);
    if (!stored) return null;

    return this.createSkillFromStored(stored);
  }

  async listSkills(): Promise<StoredSkill[]> {
    return databaseSkillLoader.getAllSkills();
  }

  async searchSkills(query: string, context?: SkillExecutionContext): Promise<StoredSkill[]> {
    return databaseSkillLoader.searchSkills(query, context);
  }

  async executeSkill(
    name: string,
    input: unknown,
    context?: Partial<SkillExecutionContext>
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const fullContext: SkillExecutionContext = {
      skillId: '',
      skillName: name,
      timestamp: new Date(),
      ...context,
    };

    try {
      const skill = await this.getSkill(name, fullContext);

      if (!skill) {
        return {
          success: false,
          output: null,
          error: `Skill not found: ${name}`,
          skillId: '',
          skillName: name,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await skill.execute(input);

      return {
        success: true,
        output: result,
        skillId: fullContext.skillId,
        skillName: name,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[SkillSystem] Skill execution failed: ${name}`, error);

      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        skillId: fullContext.skillId,
        skillName: name,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private createSkillFromStored(stored: StoredSkill): Skill {
    return {
      name: stored.name,
      description: stored.description || '',
      instructions: stored.instructions || '',
      execute: async (input: unknown) => {
        logger.info(`[SkillSystem] Executing skill: ${stored.name}`);

        if (stored.instructions) {
          return {
            instructions: stored.instructions,
            input,
            metadata: {
              skillId: stored.id,
              source: stored.source,
              permissions: stored.permissions,
            },
          };
        }

        return {
          skillId: stored.id,
          name: stored.name,
          input,
          metadata: stored.manifest,
        };
      },
    };
  }

  getCacheStats(): { size: number; valid: boolean } {
    return {
      size: databaseSkillLoader.getCacheSize(),
      valid: databaseSkillLoader.isCacheValid(),
    };
  }
}

export const skillSystem = new SkillSystem();
