import { describe, expect, it } from 'vitest';

import { FOUNDATION_STATUS, PROJECT_NAME } from '../src/index.js';

describe('engineering foundation', () => {
  it('exposes project metadata from the source entry point', () => {
    expect(PROJECT_NAME).toBe('Job Intelligence Engine');
    expect(FOUNDATION_STATUS).toBe('storage-and-repositories');
  });
});
