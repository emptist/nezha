import fs from 'fs';
import path from 'path';

export interface ClawHubSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
  repository: string;
  verified: boolean;
  scanStatus?: 'clean' | 'suspicious' | 'malicious';
  createdAt: string;
  updatedAt: string;
}

export interface SkillReviewResult {
  skill: ClawHubSkill;
  isSafe: boolean;
  score: number;
  warnings: string[];
  issues: string[];
  codeAnalysis?: CodeAnalysis;
}

export interface CodeAnalysis {
  hasNetworkCalls: boolean;
  hasFileOperations: boolean;
  hasSystemCommands: boolean;
  hasEnvironmentAccess: boolean;
  hasApiKeys: boolean;
  suspiciousPatterns: string[];
  permissions: string[];
}

const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/gi, message: 'Dynamic code execution (eval)' },
  { pattern: /exec\s*\(/gi, message: 'Command execution (exec)' },
  { pattern: /child_process|spawn|fork/gi, message: 'Process spawning' },
  { pattern: /process\.env/gi, message: 'Environment variable access' },
  { pattern: /fs\.writeFile|fs\.writeFileSync/gi, message: 'File writing' },
  { pattern: /rm\s+-rf|unlink|splice/gi, message: 'Destructive operations' },
  { pattern: /curl|wget/gi, message: 'Network downloads' },
  { pattern: /https?:\/\/[^\s]*\.(exe|dll|sh|bat)/gi, message: 'Binary downloads' },
  { pattern: /password|secret|token|api[_-]?key/gi, message: 'Credential access patterns' },
  { pattern: /base64\s*decode|atob|btoa/gi, message: 'Encoding/decoding operations' },
  { pattern: /crypto|encrypt|decrypt/gi, message: 'Cryptographic operations' },
  { pattern: /subprocess|os\.system/gi, message: 'System command execution' },
  { pattern: /socket|net\.|http\.Agent/gi, message: 'Network socket operations' },
  {
    pattern: /require\s*\(\s*['"]child_process|['"]fs['"]\s*\)/gi,
    message: 'Dangerous module imports',
  },
];

const SUSPICIOUS_PATTERNS = [
  { pattern: /setTimeout.*1000.*while/gi, message: 'Potential infinite loop with timeout' },
  { pattern: /console\.clear|process\.stdout\.write/gi, message: 'Console manipulation' },
  { pattern: /JSON\.parse.*user/gi, message: 'User-controlled JSON parsing' },
  { pattern: /\.env\.|dotenv/gi, message: '.env file access' },
];

export class SkillReviewer {
  async reviewSkill(skill: ClawHubSkill, skillContent?: string): Promise<SkillReviewResult> {
    const warnings: string[] = [];
    const issues: string[] = [];
    const codeAnalysis: CodeAnalysis = {
      hasNetworkCalls: false,
      hasFileOperations: false,
      hasSystemCommands: false,
      hasEnvironmentAccess: false,
      hasApiKeys: false,
      suspiciousPatterns: [],
      permissions: [],
    };

    let score = 100;

    if (skill.scanStatus === 'malicious') {
      score = 0;
      issues.push('Flagged as malicious by security scan');
    } else if (skill.scanStatus === 'suspicious') {
      score -= 50;
      warnings.push('Flagged as suspicious by security scan');
    }

    if (!skill.verified) {
      warnings.push('Skill is not verified by ClawHub');
      score -= 10;
    }

    if (skill.downloads < 100) {
      warnings.push(`Low download count (${skill.downloads}) - less community testing`);
      score -= 5;
    }

    if (skillContent) {
      this.analyzeCode(skillContent, codeAnalysis, warnings, issues);
    }

    score -= codeAnalysis.suspiciousPatterns.length * 5;
    score = Math.max(0, Math.min(100, score));

    return {
      skill,
      isSafe: issues.length === 0 && score >= 70,
      score,
      warnings,
      issues,
      codeAnalysis,
    };
  }

  async reviewBatch(skills: ClawHubSkill[], contents?: string[]): Promise<SkillReviewResult[]> {
    const results: SkillReviewResult[] = [];
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      if (!skill) continue;
      const content = contents?.[i];
      const result = await this.reviewSkill(skill, content);
      results.push(result);
    }
    return results;
  }

  private analyzeCode(
    code: string,
    analysis: CodeAnalysis,
    warnings: string[],
    issues: string[]
  ): void {
    for (const { pattern, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        issues.push(message);
        analysis.suspiciousPatterns.push(message);
      }
    }

    for (const { pattern, message } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(code)) {
        warnings.push(message);
        analysis.suspiciousPatterns.push(message);
      }
    }

    analysis.hasNetworkCalls = /https?|fetch|axios|curl|wget|socket|net\./.test(code);
    analysis.hasFileOperations = /fs\.|readFile|writeFile|readdir|stat/.test(code);
    analysis.hasSystemCommands = /child_process|spawn|exec|system|bash|\|\s*sh/.test(code);
    analysis.hasEnvironmentAccess = /process\.env|process\.argv|getenv/.test(code);
    analysis.hasApiKeys = /api[_-]?key|secret|token|password|credential/.test(code);

    if (analysis.hasNetworkCalls) analysis.permissions.push('network');
    if (analysis.hasFileOperations) analysis.permissions.push('filesystem');
    if (analysis.hasSystemCommands) analysis.permissions.push('shell');
    if (analysis.hasEnvironmentAccess) analysis.permissions.push('env');
  }

  async reviewSkillFiles(skillPath: string): Promise<SkillReviewResult | null> {
    try {
      const manifest = await this.readJsonFile(path.join(skillPath, 'claw.json'));
      const instructions = await this.readFile(path.join(skillPath, 'instructions.md'));
      const readme = await this.readFile(path.join(skillPath, 'README.md'));

      const combinedContent = [manifest, instructions, readme].filter(Boolean).join('\n\n');

      const skill: ClawHubSkill = {
        id: String(manifest?.id || 'unknown'),
        name: String(manifest?.name || 'Unknown'),
        description: String(manifest?.description || ''),
        author: String(manifest?.author || 'Unknown'),
        version: String(manifest?.version || '1.0.0'),
        downloads: 0,
        rating: 0,
        tags: Array.isArray(manifest?.tags) ? (manifest.tags as string[]) : [],
        repository: '',
        verified: false,
        createdAt: '',
        updatedAt: '',
      };

      return this.reviewSkill(skill, combinedContent);
    } catch {
      return null;
    }
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async readJsonFile(filePath: string): Promise<Record<string, unknown>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  formatReviewReport(result: SkillReviewResult): string {
    const lines: string[] = [];
    const status = result.isSafe ? '✓ SAFE' : '✗ UNSAFE';

    lines.push(`\n=== Skill Review: ${result.skill.name} ===`);
    lines.push(`Status: ${status} (Score: ${result.score}/100)`);
    lines.push(`Author: ${result.skill.author}`);
    lines.push(`Verified: ${result.skill.verified ? 'Yes' : 'No'}`);
    lines.push(`Downloads: ${result.skill.downloads}`);

    if (result.codeAnalysis && result.codeAnalysis.permissions.length > 0) {
      lines.push(`\nPermissions Required:`);
      for (const perm of result.codeAnalysis.permissions) {
        lines.push(`  - ${perm}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`\nWarnings:`);
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning}`);
      }
    }

    if (result.issues.length > 0) {
      lines.push(`\nIssues (Blocking):`);
      for (const issue of result.issues) {
        lines.push(`  ✗ ${issue}`);
      }
    }

    return lines.join('\n');
  }
}

export const skillReviewer = new SkillReviewer();
