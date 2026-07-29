import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigurationError,
  loadConfiguration,
  summarizeConfiguration,
} from '../../src/application/index.js';
import {
  FileSystemConfigReader,
  ZodYamlConfigurationDecoder,
} from '../../src/infrastructure/index.js';
import {
  createTemporaryConfigDirectory,
  removeTemporaryConfigDirectory,
  replaceInConfig,
  writeConfig,
} from '../helpers/config-directory.js';

describe('configuration loading', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTemporaryConfigDirectory();
  });

  afterEach(async () => {
    await removeTemporaryConfigDirectory(directory);
  });

  it('loads all private-name fixtures and produces the expected summary', async () => {
    const bundle = await loadFrom(directory);
    expect(summarizeConfiguration(bundle)).toEqual({
      candidateDisplayName: 'Artem',
      enabledTrackCount: 5,
      enabledSourceCount: 3,
      dailyRecommendationLimit: 20,
    });
  });

  it('loads tracked examples only when explicitly requested', async () => {
    await expect(loadFrom('config', true)).resolves.toMatchObject({
      candidate: { displayName: 'Artem' },
    });
  });

  it('reports a missing file', async () => {
    await rm(join(directory, 'profile.yaml'));
    await expectIssue(directory, 'CONFIG_FILE_NOT_FOUND');
  });

  it('reports an unreadable file', async () => {
    const path = join(directory, 'profile.yaml');
    await rm(path);
    await mkdir(path);
    await expectIssue(directory, 'CONFIG_FILE_UNREADABLE');
  });

  it('wraps malformed YAML', async () => {
    await writeConfig(directory, 'profile', 'candidate: [unterminated');
    await expectIssue(directory, 'CONFIG_YAML_INVALID');
  });

  it('reports all useful schema issues without exposing input', async () => {
    await writeConfig(
      directory,
      'profile',
      'candidate:\n  id: INVALID ID\n  extra: secret-looking-value\n',
    );
    const error = await captureConfigurationError(directory);
    expect(error.issues.length).toBeGreaterThan(1);
    expect(
      error.issues.every((issue) => issue.code === 'CONFIG_SCHEMA_INVALID'),
    ).toBe(true);
    expect(error.message).not.toContain('secret-looking-value');
  });

  it('rejects duplicate track IDs', async () => {
    await replaceInConfig(directory, 'search', 'id: data-science', 'id: quant');
    await expectIssue(directory, 'CONFIG_DUPLICATE_ID');
  });

  it('rejects duplicate source IDs', async () => {
    await replaceInConfig(
      directory,
      'sources',
      'id: example-lever',
      'id: example-greenhouse',
    );
    await expectIssue(directory, 'CONFIG_DUPLICATE_ID');
  });

  it('rejects a scoring total other than 100', async () => {
    await replaceInConfig(
      directory,
      'scoring',
      'applicationSimplicity: 2',
      'applicationSimplicity: 3',
    );
    await expectIssue(directory, 'CONFIG_WEIGHT_TOTAL_INVALID');
  });

  it('rejects quotas and per-company limits above the daily limit', async () => {
    await replaceInConfig(
      directory,
      'search',
      'recommendationQuota: 4',
      'recommendationQuota: 21',
    );
    await replaceInConfig(
      directory,
      'search',
      'maximumRecommendationsPerCompany: 3',
      'maximumRecommendationsPerCompany: 21',
    );
    const error = await captureConfigurationError(directory);
    expect(
      error.issues.filter((issue) => issue.code === 'CONFIG_RANGE_INVALID'),
    ).toHaveLength(2);
  });

  it('rejects an invalid source URL', async () => {
    await replaceInConfig(
      directory,
      'sources',
      'https://careers.example.com/jobs',
      'not-a-url',
    );
    await expectIssue(directory, 'CONFIG_SCHEMA_INVALID');
  });

  it('rejects reversed experience and salary ranges', async () => {
    await replaceInConfig(
      directory,
      'search',
      'minimumYears: 0',
      'minimumYears: 9',
    );
    await expectIssue(directory, 'CONFIG_RANGE_INVALID');

    await replaceInConfig(
      directory,
      'search',
      'minimumYears: 9',
      'minimumYears: 0',
    );
    await replaceInConfig(
      directory,
      'search',
      'minimum: 70000',
      'minimum: 160000',
    );
    await expectIssue(directory, 'CONFIG_RANGE_INVALID');
  });

  it('requires an enabled track', async () => {
    const path = join(directory, 'search.yaml');
    const content = await readFile(path, 'utf8');
    await writeFile(
      path,
      content.replaceAll('enabled: true', 'enabled: false'),
      'utf8',
    );
    await expectIssue(directory, 'CONFIG_REFERENCE_INVALID');
  });

  it('requires an enabled source', async () => {
    const path = join(directory, 'sources.yaml');
    const content = await readFile(path, 'utf8');
    await writeFile(
      path,
      content.replaceAll('enabled: true', 'enabled: false'),
      'utf8',
    );
    await expectIssue(directory, 'CONFIG_REFERENCE_INVALID');
  });

  it('rejects unknown track references and incompatible relocation preferences', async () => {
    await replaceInConfig(
      directory,
      'sources',
      '- data-science',
      '- missing-track',
    );
    await replaceInConfig(
      directory,
      'search',
      'willingToRelocate: true',
      'willingToRelocate: false',
    );
    const error = await captureConfigurationError(directory);
    expect(error.issues.map((issue) => issue.code)).toContain(
      'CONFIG_REFERENCE_INVALID',
    );
    expect(error.issues.length).toBeGreaterThanOrEqual(2);
  });
});

async function loadFrom(directory: string, useExamples = false) {
  return loadConfiguration(
    {
      reader: new FileSystemConfigReader(),
      decoder: new ZodYamlConfigurationDecoder(),
    },
    { directory, useExamples },
  );
}

async function captureConfigurationError(
  directory: string,
): Promise<ConfigurationError> {
  try {
    await loadFrom(directory);
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected configuration loading to fail.');
}

async function expectIssue(directory: string, code: string): Promise<void> {
  const error = await captureConfigurationError(directory);
  expect(error.issues.map((issue) => issue.code)).toContain(code);
}
