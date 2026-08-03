import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('validate-config CLI', () => {
  it('validates tracked examples through the npm command', async () => {
    const npmExecutable = process.env.npm_execpath;
    if (npmExecutable === undefined) {
      throw new Error('npm_execpath is required for the CLI integration test.');
    }
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [npmExecutable, 'run', 'cli', '--', 'validate-config', '--examples'],
      { cwd: process.cwd(), windowsHide: true },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Configuration valid');
    expect(stdout).toContain('Candidate: Example Candidate');
    expect(stdout).toContain('Enabled tracks: 5');
    expect(stdout).toContain('Enabled sources: 0');
    expect(stdout).toContain('Daily recommendation limit: 20');
  }, 60_000);
});
