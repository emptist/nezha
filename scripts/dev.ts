// Development scripts for faster iteration

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const scripts = {
  dev: 'tsx watch src/cli/index.ts start',
  build: 'tsc',
  test: 'vitest',
  'test:watch': 'vitest --watch',
  lint: 'eslint src --ext .ts',
  'db:migrate': 'tsx scripts/migrate.ts',
  'db:seed': 'tsx scripts/seed.ts',
  'db:reset': 'npm run db:migrate && npm run db:seed',
  clean: 'rm -rf dist .turbo node_modules/.cache',
  typecheck: 'tsc --noEmit',
};

const packageJson = {
  name: 'nezha',
  version: '1.0.0',
  type: 'module',
  scripts: {
    dev: 'tsx watch src/cli/index.ts start',
    build: 'tsc',
    test: 'vitest',
    'test:watch': 'vitest --watch',
    lint: 'eslint src --ext .ts',
    'db:migrate': 'tsx scripts/migrate.ts',
    'db:seed': 'tsx scripts/seed.ts',
    'db:reset': 'npm run db:migrate && npm run db:seed',
    clean: 'rm -rf dist .turbo node_modules/.cache',
    typecheck: 'tsc --noEmit',
  },
};

function updatePackageJson() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const existing = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const updated = { ...existing, scripts: { ...existing.scripts, ...scripts } };
  fs.writeFileSync(pkgPath, JSON.stringify(updated, null, 2));
  console.log('Updated package.json scripts');
}

function runScript(scriptName: string) {
  const script = scripts[scriptName as keyof typeof scripts];
  if (!script) {
    console.error(`Unknown script: ${scriptName}`);
    process.exit(1);
  }
  console.log(`Running: ${script}`);
  execSync(script, { stdio: 'inherit' });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'init') {
  updatePackageJson();
} else if (command && scripts[command as keyof typeof scripts]) {
  runScript(command);
} else {
  console.log('Available scripts:');
  Object.entries(scripts).forEach(([name, cmd]) => {
    console.log(`  npm run ${name} - ${cmd}`);
  });
}
