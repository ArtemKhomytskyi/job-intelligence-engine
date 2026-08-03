import { describe, expect, it } from 'vitest';

import { runCli } from '../../src/interfaces/index.js';
import {
  createTemporaryConfigDirectory,
  removeTemporaryConfigDirectory,
} from '../helpers/config-directory.js';

describe('CLI behavior', () => {
  it('shows help when no command is provided', async () => {
    const output = captureOutput();
    await expect(runCli([], output)).resolves.toBe(0);
    expect(output.stdout.join('')).toContain('Usage:');
    expect(output.stderr).toEqual([]);
  });

  it('shows help when requested', async () => {
    const output = captureOutput();
    await expect(runCli(['--help'], output)).resolves.toBe(0);
    expect(output.stdout.join('')).toContain('Usage:');
    expect(output.stderr).toEqual([]);
  });

  it('returns a usage error for an unknown command', async () => {
    const output = captureOutput();
    await expect(runCli(['unknown'], output)).resolves.toBe(2);
    expect(output.stderr.join('')).toContain('Unknown command');
  });

  it('returns a usage error for an invalid option', async () => {
    const output = captureOutput();
    await expect(
      runCli(['validate-config', '--unsupported'], output),
    ).resolves.toBe(2);
    expect(output.stderr.join('')).toContain('Unknown option');
  });

  it('returns a JSON summary for valid examples', async () => {
    const output = captureOutput();
    await expect(
      runCli(['validate-config', '--examples', '--json'], output),
    ).resolves.toBe(0);
    expect(JSON.parse(output.stdout.join(''))).toEqual({
      valid: true,
      candidate: 'Artem',
      enabledTracks: 5,
      enabledSources: 0,
      dailyRecommendationLimit: 20,
    });
  });

  it('reports source readiness without performing collection', async () => {
    const directory = await createTemporaryConfigDirectory();
    try {
      const output = captureOutput();
      await expect(
        runCli(['sources:check', '--config-dir', directory], output),
      ).resolves.toBe(0);
      expect(output.stdout.join('')).toContain('Source configuration ready');
      expect(output.stdout.join('')).toContain(
        'my-greenhouse-source | greenhouse | enabled | real | ready',
      );
      expect(output.stdout.join('')).toContain(
        'This check performs no network requests.',
      );
    } finally {
      await removeTemporaryConfigDirectory(directory);
    }
  });

  it('reports missing private files without falling back to examples', async () => {
    const output = captureOutput();
    await expect(
      runCli(['validate-config', '--config-dir', 'does-not-exist'], output),
    ).resolves.toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain('CONFIG_FILE_NOT_FOUND');
    expect(output.stderr.join('')).toContain('4 issues');
  });

  it('returns a configuration error from the process command before database access', async () => {
    const output = captureOutput();
    await expect(
      runCli(['process', '--config-dir', 'does-not-exist'], output),
    ).resolves.toBe(2);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain('Configuration contains 4 issues');
  });

  it('returns a usage error for an invalid process limit', async () => {
    const directory = await createTemporaryConfigDirectory();
    try {
      const output = captureOutput();
      await expect(
        runCli(
          ['process', '--config-dir', directory, '--limit', 'not-a-number'],
          output,
        ),
      ).resolves.toBe(2);
      expect(output.stdout).toEqual([]);
      expect(output.stderr.join('')).toContain(
        'Processing limit must be an integer',
      );
    } finally {
      await removeTemporaryConfigDirectory(directory);
    }
  });

  it.each(['0', '-1', '1.5', 'not-a-number'])(
    'returns a usage error for recommend limit %s before database access',
    async (limit) => {
      const directory = await createTemporaryConfigDirectory();
      try {
        const output = captureOutput();
        await expect(
          runCli(
            [
              'recommend',
              '--config-dir',
              directory,
              ...(limit.startsWith('-')
                ? [`--limit=${limit}`]
                : ['--limit', limit]),
            ],
            output,
          ),
        ).resolves.toBe(2);
        expect(output.stdout).toEqual([]);
        expect(output.stderr.join('')).toContain(
          'Recommendation limit must be an integer',
        );
      } finally {
        await removeTemporaryConfigDirectory(directory);
      }
    },
  );
});

function captureOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writeStdout: (value: string) => stdout.push(value),
    writeStderr: (value: string) => stderr.push(value),
  };
}
