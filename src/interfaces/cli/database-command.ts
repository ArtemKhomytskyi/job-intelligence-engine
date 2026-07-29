import { PersistenceError } from '../../application/index.js';
import {
  PrismaDatabaseHealth,
  PrismaMigrationRunner,
  withPrismaClient,
} from '../../infrastructure/index.js';
import type { CommandOutput } from './validate-config-command.js';

export type DatabaseCommand = 'db:check' | 'db:migrate' | 'db:status';

export async function runDatabaseCommand(
  command: DatabaseCommand,
  output: CommandOutput,
): Promise<number> {
  try {
    switch (command) {
      case 'db:check':
        await withPrismaClient(async (client) => {
          await new PrismaDatabaseHealth(client).check();
        });
        output.writeStdout('Database connection healthy.\n');
        break;
      case 'db:migrate':
        await new PrismaMigrationRunner().deploy();
        output.writeStdout('Database migrations applied.\n');
        break;
      case 'db:status':
        await new PrismaMigrationRunner().status();
        output.writeStdout('Database migrations are current.\n');
        break;
    }
    return 0;
  } catch (error: unknown) {
    const persistenceError =
      error instanceof PersistenceError
        ? error
        : new PersistenceError(
            'DATABASE_QUERY_FAILED',
            'The database command failed.',
            { cause: error },
          );
    output.writeStderr(
      `[${persistenceError.code}] ${persistenceError.message}\n`,
    );
    return 1;
  }
}
