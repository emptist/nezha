import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const DB_NAME = process.env.NEZHA_DB_NAME || 'nezha';
const DB_HOST = process.env.NEZHA_DB_HOST || 'localhost';
const DB_PORT = process.env.NEZHA_DB_PORT || '5432';
const DB_USER = process.env.NEZHA_DB_USER || 'postgres';
const PSQL_PATH =
  process.env.PSQL_PATH || '/Applications/Postgres.app/Contents/Versions/18/bin/psql';

const MIGRATIONS_DIR = 'src/db/migrations';

function getMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .filter(f => {
      const stats = statSync(join(MIGRATIONS_DIR, f));
      return stats.isFile();
    })
    .sort();
  return files;
}

function runMigration(file: string): boolean {
  const fullPath = join(MIGRATIONS_DIR, file);
  console.log(`Running migration: ${file}`);
  try {
    execSync(
      `"${PSQL_PATH}" -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${fullPath}"`,
      { stdio: 'inherit' }
    );
    return true;
  } catch (error) {
    console.error(`Migration failed: ${file}`);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const specificMigration = args[0];

  if (specificMigration) {
    runMigration(specificMigration);
    return;
  }

  console.log('Running all migrations...\n');
  const files = getMigrationFiles();
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const success = runMigration(file);
    if (success) {
      successCount++;
    } else {
      failCount++;
      console.log(`Skipping remaining migrations due to failure`);
      break;
    }
  }

  console.log(`\nMigrations complete: ${successCount} succeeded, ${failCount} failed`);
}

main();
