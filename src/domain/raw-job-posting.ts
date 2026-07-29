import type { JsonValue } from './job-posting.js';

export interface RawJobPosting {
  readonly sourceId: string;
  readonly externalId: string;
  readonly sourceUrl: string;
  readonly applicationUrl?: string;
  readonly rawTitle: string;
  readonly rawCompany: string;
  readonly rawDescription?: string;
  readonly rawLocation?: string;
  readonly sourcePublishedAt?: string;
  readonly sourceExpiresAt?: string;
  readonly rawPayload?: JsonValue;
  readonly collectedAt: string;
}
