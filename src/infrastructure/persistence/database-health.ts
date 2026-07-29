import type { PrismaClient } from '@prisma/client';

import type { DatabaseHealthPort } from '../../application/index.js';
import { mapPrismaError } from './prisma-errors.js';

export class PrismaDatabaseHealth implements DatabaseHealthPort {
  public constructor(private readonly client: PrismaClient) {}

  public async check(): Promise<void> {
    try {
      await this.client.$queryRaw`SELECT 1`;
    } catch (cause: unknown) {
      throw mapPrismaError(cause);
    }
  }
}
