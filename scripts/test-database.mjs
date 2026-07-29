import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const action = process.argv[2];
if (action !== 'migrate' && action !== 'reset') {
  process.stderr.write(
    'Usage: node scripts/test-database.mjs <migrate|reset>\n',
  );
  process.exitCode = 2;
} else {
  try {
    startDatabaseCommand(action);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Invalid test database configuration.'}\n`,
    );
    process.exitCode = 2;
  }
}

function startDatabaseCommand(command) {
  const testDatabaseUrl = requireSafeTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
  );
  const prismaEntry = resolve('node_modules', 'prisma', 'build', 'index.js');
  const args =
    command === 'reset'
      ? ['migrate', 'reset', '--force', '--skip-seed']
      : ['migrate', 'deploy'];
  const child = spawn(
    process.execPath,
    [prismaEntry, ...args, '--schema', 'prisma/schema.prisma'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
      shell: false,
    },
  );
  child.once('error', () => {
    process.stderr.write(
      'Unable to start the guarded test database command.\n',
    );
    process.exitCode = 1;
  });
  child.once('close', (code) => {
    process.exitCode = code ?? 1;
  });
}

export function requireSafeTestDatabaseUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      'TEST_DATABASE_URL is required for database test commands.',
    );
  }
  const parsed = new URL(value);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const databaseName = parsed.pathname.slice(1).toLocaleLowerCase('en-US');
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !localHosts.has(parsed.hostname) ||
    !/(?:^|[-_])test(?:$|[-_])/u.test(databaseName)
  ) {
    throw new Error(
      'TEST_DATABASE_URL must target a localhost PostgreSQL database whose name has a standalone "test" marker.',
    );
  }
  return value;
}
