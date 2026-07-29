import type { JobPosting } from './job-posting.js';

export interface NormalizedJobPosting {
  readonly job: JobPosting;
  readonly canonicalUrl: string;
  readonly normalizedTitle: string;
  readonly normalizedCompany: string;
  readonly normalizedSkills: readonly string[];
  readonly sourceTrace: {
    readonly sourceId: string;
    readonly externalId: string;
  };
}
