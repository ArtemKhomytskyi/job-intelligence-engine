import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(
    databaseUrl === undefined
      ? undefined
      : { datasources: { db: { url: databaseUrl } } },
  );
}

export async function withPrismaClient<T>(
  operation: (client: PrismaClient) => Promise<T>,
  databaseUrl?: string,
): Promise<T> {
  const client = createPrismaClient(databaseUrl);
  try {
    return await operation(client);
  } finally {
    await client.$disconnect();
  }
}
