#!/usr/bin/env node

import { config } from 'dotenv';
config();

import * as fs from 'fs';
import * as path from 'path';

interface PrivacyIssue {
  file: string;
  line: number;
  type: string;
  match: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const SENSITIVE_PATTERNS = [
  { name: 'API Key', pattern: /(?:api[_-]?key|apikey)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'Secret Key', pattern: /(?:secret[_-]?key|secretkey)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'Password', pattern: /(?:password|passwd|pwd)['":\s]*['"]?([^\s'"]{8,})['"]?/gi, severity: 'critical' as const },
  { name: 'Database URL', pattern: /postgres(?:ql)?:\/\/[^\s'"]+/gi, severity: 'critical' as const },
  { name: 'MySQL URL', pattern: /mysql:\/\/[^\s'"]+/gi, severity: 'critical' as const },
  { name: 'MongoDB URL', pattern: /mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, severity: 'critical' as const },
  { name: 'Redis URL', pattern: /redis:\/\/[^\s'"]+/gi, severity: 'critical' as const },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/gi, severity: 'critical' as const },
  { name: 'JWT Secret', pattern: /jwt[_-]?secret['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'Access Token', pattern: /(?:access[_-]?token|accesstoken)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'Refresh Token', pattern: /(?:refresh[_-]?token|refreshtoken)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'OAuth Token', pattern: /oauth[_-]?token['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, severity: 'critical' as const },
  { name: 'AWS Access Key', pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g, severity: 'critical' as const },
  { name: 'AWS Secret', pattern: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)['":\s]*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi, severity: 'critical' as const },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g, severity: 'critical' as const },
  { name: 'GitHub OAuth', pattern: /gho_[a-zA-Z0-9]{36}/g, severity: 'critical' as const },
  { name: 'GitHub App Token', pattern: /ghu_[a-zA-Z0-9]{36}/g, severity: 'critical' as const },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/g, severity: 'critical' as const },
  { name: 'Stripe Key', pattern: /sk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' as const },
  { name: 'Stripe Publishable', pattern: /pk_live_[a-zA-Z0-9]{24,}/g, severity: 'high' as const },
  { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{20,}/g, severity: 'critical' as const },
  { name: 'Anthropic Key', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g, severity: 'critical' as const },
  { name: 'Email Address', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, severity: 'medium' as const },
  { name: 'IP Address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, severity: 'low' as const },
  { name: 'Phone Number', pattern: /(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/g, severity: 'medium' as const },
  { name: 'Credit Card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, severity: 'critical' as const },
  { name: 'SSN', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, severity: 'critical' as const },
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /coverage/,
  /\.env\.example$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

const IGNORE_EXAMPLE_VALUES = [
  'your-api-key',
  'your-secret-key',
  'your-password',
  'your_password',
  'your-token',
  'example.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'test@test.com',
  'user@example.com',
  'placeholder',
  'changeme',
  'xxx',
  '****',
];

function shouldIgnoreFile(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

function isExampleValue(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return IGNORE_EXAMPLE_VALUES.some(example => lowerValue.includes(example));
}

function scanFile(filePath: string): PrivacyIssue[] {
  const issues: PrivacyIssue[] = [];
  
  if (shouldIgnoreFile(filePath)) {
    return issues;
  }
  
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return issues;
  }
  
  const lines = content.split('\n');
  
  for (const { name, pattern, severity } of SENSITIVE_PATTERNS) {
    let match;
    const globalPattern = new RegExp(pattern.source, pattern.flags);
    
    while ((match = globalPattern.exec(content)) !== null) {
      const matchedText = match[0];
      
      if (isExampleValue(matchedText)) {
        continue;
      }
      
      const position = match.index;
      let lineNumber = 1;
      let currentIndex = 0;
      
      for (let i = 0; i < lines.length; i++) {
        if (currentIndex + lines[i].length >= position) {
          lineNumber = i + 1;
          break;
        }
        currentIndex += lines[i].length + 1;
      }
      
      const truncatedMatch = matchedText.length > 100 
        ? matchedText.substring(0, 100) + '...' 
        : matchedText;
      
      issues.push({
        file: filePath,
        line: lineNumber,
        type: name,
        match: truncatedMatch,
        severity,
      });
    }
  }
  
  return issues;
}

function scanDirectory(dir: string, issues: PrivacyIssue[] = []): PrivacyIssue[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (shouldIgnoreFile(fullPath)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath, issues);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const scanExtensions = [
        '.ts', '.js', '.json', '.yaml', '.yml', '.md', 
        '.txt', '.env', '.example', '.config', '.sql',
        '.sh', '.bash', '.zsh', '.py', '.rb', '.go',
      ];
      
      if (scanExtensions.includes(ext) || entry.name.startsWith('.env') || entry.name.includes('config')) {
        const fileIssues = scanFile(fullPath);
        issues.push(...fileIssues);
      }
    }
  }
  
  return issues;
}

function main(): void {
  const args = process.argv.slice(2);
  const targetDir = args[0] || process.cwd();
  
  console.log('🔒 Privacy Check Tool');
  console.log('='.repeat(50));
  console.log(`Scanning: ${targetDir}\n`);
  
  const issues = scanDirectory(targetDir);
  
  if (issues.length === 0) {
    console.log('✅ No privacy issues found!');
    process.exit(0);
  }
  
  const critical = issues.filter(i => i.severity === 'critical');
  const high = issues.filter(i => i.severity === 'high');
  const medium = issues.filter(i => i.severity === 'medium');
  const low = issues.filter(i => i.severity === 'low');
  
  console.log(`Found ${issues.length} potential privacy issues:\n`);
  
  const severityEmoji: Record<string, string> = {
    critical: '🚨',
    high: '⚠️',
    medium: '⚡',
    low: 'ℹ️',
  };
  
  const printIssues = (issueList: PrivacyIssue[], label: string): void => {
    if (issueList.length === 0) return;
    
    console.log(`\n${severityEmoji[issueList[0].severity]} ${label} (${issueList.length}):`);
    console.log('-'.repeat(50));
    
    for (const issue of issueList) {
      const relativePath = path.relative(targetDir, issue.file);
      console.log(`\n  File: ${relativePath}:${issue.line}`);
      console.log(`  Type: ${issue.type}`);
      console.log(`  Match: ${issue.match}`);
    }
  };
  
  printIssues(critical, 'CRITICAL');
  printIssues(high, 'HIGH');
  printIssues(medium, 'MEDIUM');
  printIssues(low, 'LOW');
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:');
  console.log(`  🚨 Critical: ${critical.length}`);
  console.log(`  ⚠️  High: ${high.length}`);
  console.log(`  ⚡ Medium: ${medium.length}`);
  console.log(`  ℹ️  Low: ${low.length}`);
  
  if (critical.length > 0) {
    console.log('\n❌ CRITICAL issues found! Do NOT publish until resolved.');
    process.exit(1);
  } else if (high.length > 0) {
    console.log('\n⚠️  HIGH severity issues found. Review before publishing.');
    process.exit(1);
  } else {
    console.log('\n✅ No critical or high severity issues. Review medium/low issues before publishing.');
    process.exit(0);
  }
}

main();
