import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  PersistenceError,
  type DatabaseMigrationPort,
} from '../../application/index.js';

export class PrismaMigrationRunner implements DatabaseMigrationPort {
  public deploy(): Promise<void> {
    return runPrismaMigrationCommand(['migrate', 'deploy']);
  }

  public status(): Promise<void> {
    return runPrismaMigrationCommand(['migrate', 'status']);
  }
}

async function runPrismaMigrationCommand(
  args: readonly string[],
): Promise<void> {
  const prismaEntry = resolve('node_modules', 'prisma', 'build', 'index.js');
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [prismaEntry, ...args, '--schema', 'prisma/schema.prisma'],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
      },
    );
    let errorOutput = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      errorOutput += chunk;
    });
    child.once('error', (cause: unknown) => {
      rejectPromise(
        new PersistenceError(
          'DATABASE_UNAVAILABLE',
          'The Prisma migration command could not be started.',
          { cause },
        ),
      );
    });
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new PersistenceError(
          args.includes('status')
            ? 'MIGRATION_REQUIRED'
            : 'DATABASE_QUERY_FAILED',
          args.includes('status')
            ? 'Database migrations are not current.'
            : 'Database migration deployment failed.',
          {
            cause: new Error(
              errorOutput || `Prisma exited with code ${String(code)}.`,
            ),
          },
        ),
      );
    });
  });
}
