import { createHash } from 'node:crypto';

import type { NormalizedJobPosting } from '../../domain/index.js';
import type { JobFingerprintValue } from './models.js';

function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

export function createExactJobFingerprint(
  posting: NormalizedJobPosting,
): JobFingerprintValue {
  const identity = [
    normalizeIdentityPart(posting.normalizedCompany),
    normalizeIdentityPart(posting.normalizedTitle),
    normalizeIdentityPart(posting.canonicalUrl),
  ].join('\n');
  return {
    value: createHash('sha256').update(identity, 'utf8').digest('hex'),
    algorithm: 'sha256',
    version: 1,
    kind: 'exact-identity',
  };
}
