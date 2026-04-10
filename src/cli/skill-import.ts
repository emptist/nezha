#!/usr/bin/env node
/**
 * Skill Import Tool - Sync skills between filesystem and database
 *
 * Usage:
 *   node dist/cli/skill-import.js import    - Import from disk to DB
 *   node dist/cli/skill-import.js export    - Export from DB to disk
 *   node dist/cli/skill-import.js sync      - Bidirectional sync (DB wins on conflict)
 *   node dist/cli/skill-import.js recover   - Recover DB from disk (force import)
 *
 * Concept: File system + database help each other
 * - Disk is the source of truth for skill definitions
 * - DB provides search, trigger_phrases indexing, use_count tracking
 * - recover: Force re-import from disk to DB (for corrupted/missing DB entries)
 */

import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const SKILLS_DIR = join(process.cwd(), 'skills');

interface SkillMetadata {
  name: string;
  description: string;
  trigger: string[];
}

async function parseFrontmatter(content: string): Promise<SkillMetadata | null> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1] || '';
  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  const triggerMatch = frontmatter.match(/trigger:\s*(.+)/);

  if (!nameMatch?.[1]) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch?.[1]?.trim() || '',
    trigger: triggerMatch?.[1]?.split(',').map(t => t.trim()) || [],
  };
}

async function importSkills(db: DatabaseClient): Promise<{ imported: number; updated: number }> {
  const files = await readdir(SKILLS_DIR);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  console.log(`Scanning ${mdFiles.length} skill files in ${SKILLS_DIR}`);

  let imported = 0,
    updated = 0;

  for (const file of mdFiles) {
    const filePath = join(SKILLS_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const meta = await parseFrontmatter(content);

    if (!meta) {
      console.log(`  Skip: ${file} (no frontmatter)`);
      continue;
    }

    const existing = await db.query('SELECT id, use_count FROM skills WHERE name = $1', [
      meta.name,
    ]);

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE skills SET description = $1, trigger_phrases = $2, updated_at = NOW() WHERE name = $3`,
        [meta.description, meta.trigger, meta.name]
      );
      console.log(`  Updated: ${meta.name} (use_count: ${existing.rows[0]?.use_count ?? 0})`);
      updated++;
    } else {
      await db.query(
        `INSERT INTO skills (id, name, description, trigger_phrases, is_enabled, category, project_id, created_by, content)
         VALUES (gen_random_uuid(), $1, $2, $3, true, 'custom', $4, 'skill-import', $5::jsonb)`,
        [
          meta.name,
          meta.description,
          meta.trigger,
          DEFAULT_PROJECT_ID,
          JSON.stringify({ source: 'disk', file }),
        ]
      );
      console.log(`  Imported: ${meta.name}`);
      imported++;
    }
  }

  return { imported, updated };
}

async function exportSkills(db: DatabaseClient): Promise<number> {
  const skills = await db.query(
    "SELECT name, description, trigger_phrases, content FROM skills WHERE source IS NULL OR source != 'builtin'"
  );

  let exported = 0;
  for (const skill of skills.rows) {
    const fileName = `${skill.name}.md`;
    const filePath = join(SKILLS_DIR, fileName);

    const frontmatter = [
      '---',
      `name: ${skill.name}`,
      `description: ${skill.description || ''}`,
      `trigger: ${(skill.trigger_phrases || []).join(', ')}`,
      '---',
      '',
    ].join('\n');

    // Get existing content if file exists
    let existingContent = '';
    try {
      existingContent = await readFile(filePath, 'utf-8');
      const existingMeta = await parseFrontmatter(existingContent);
      if (existingMeta && existingContent.length > 50) {
        // Preserve custom content after frontmatter
        const contentStart = existingContent.indexOf('---', 4);
        if (contentStart > 0) {
          existingContent = existingContent.substring(contentStart + 3).trim();
        }
      }
    } catch {
      // File doesn't exist
    }

    const newContent =
      frontmatter +
      (existingContent
        ? '\n' + existingContent
        : '# ' + skill.name + '\n\nAdd skill content here...');
    await writeFile(filePath, newContent, 'utf-8');
    exported++;
  }

  return exported;
}

async function recoverSkills(db: DatabaseClient): Promise<{ imported: number; skipped: number }> {
  console.log('Recover mode: Force import from disk, ignoring DB state');
  const result = await importSkills(db);

  // Show what's in DB now
  const skills = await db.query(
    'SELECT name, trigger_phrases, use_count FROM skills ORDER BY name'
  );
  console.log(`\nDB now has ${skills.rows.length} skills`);

  return { imported: result.imported + result.updated, skipped: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'import';

  const config = Config.getInstance();
  const db = new DatabaseClient(config);

  try {
    // Ensure skills directory exists
    try {
      await stat(SKILLS_DIR);
    } catch {
      await mkdir(SKILLS_DIR, { recursive: true });
    }

    switch (command) {
      case 'import':
      case 'sync': {
        const result = await importSkills(db);
        console.log(`\nDone: ${result.imported} imported, ${result.updated} updated`);
        break;
      }
      case 'export': {
        const count = await exportSkills(db);
        console.log(`Exported ${count} skills to ${SKILLS_DIR}`);
        break;
      }
      case 'recover': {
        const result = await recoverSkills(db);
        console.log(`\nRecovered ${result.imported} skills from disk`);
        break;
      }
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Usage: skill-import [import|export|sync|recover]');
    }
  } finally {
    await db.close();
  }
}

main();
