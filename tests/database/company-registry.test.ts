import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  PrismaCompanyRegistryStore,
  createPrismaClient,
} from '../../src/infrastructure/index.js';

let client: PrismaClient;

beforeAll(() => {
  client = createPrismaClient(requireTestDatabaseUrl());
});

afterAll(async () => {
  await client.$disconnect();
});

beforeEach(async () => {
  await client.companyCrawlResult.deleteMany();
  await client.companyRegistry.deleteMany();
});

describe('company registry', () => {
  it('upserts deterministic discovery and exposes aggregate health', async () => {
    const store = new PrismaCompanyRegistryStore(client);
    await store.recordDiscovery(
      {
        status: 'DISCOVERED',
        companyId: 'synthetic-company',
        companyName: 'Synthetic Company',
        careersUrl: 'https://jobs.ashbyhq.com/synthetic',
        provider: 'ashby',
        confidence: 96,
        method: 'URL_PATTERN',
        evidence: [
          {
            provider: 'ashby',
            method: 'URL_PATTERN',
            confidence: 96,
            signal: 'jobs.ashbyhq.com/synthetic',
          },
        ],
        diagnostics: [],
      },
      '2026-08-03T10:00:00.000Z',
    );
    const company = await store.getCompany('synthetic-company');
    expect(company).toMatchObject({
      provider: 'ashby',
      discoveryConfidence: 96,
      crawlCount: 0,
    });
    await expect(store.getHealth()).resolves.toMatchObject({
      companyCount: 1,
      discoveredCompanyCount: 1,
      unknownProviderCount: 0,
    });
  });
});

function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (value === undefined) throw new Error('TEST_DATABASE_URL is required.');
  const parsed = new URL(value);
  const database = parsed.pathname.slice(1).toLocaleLowerCase('en-US');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/(?:^|[-_])test(?:$|[-_])/u.test(database)
  )
    throw new Error(
      'TEST_DATABASE_URL must target a guarded local test database.',
    );
  return value;
}
