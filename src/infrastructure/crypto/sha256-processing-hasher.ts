import { createHash } from 'node:crypto';

import type { ProcessingHasher } from '../../application/index.js';

export class Sha256ProcessingHasher implements ProcessingHasher {
  public sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
