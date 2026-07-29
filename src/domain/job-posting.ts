import type {
  EducationLevel,
  EmploymentType,
  RemotePolicy,
  SeniorityLevel,
} from './categories.js';
import type { LanguageRequirement, Skill } from './candidate-profile.js';
import type { ExperienceRange, SalaryRange } from './value-objects.js';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface SourceReference {
  readonly sourceId: string;
  readonly externalId: string;
  readonly sourceUrl: string;
}

export interface JobLocation {
  readonly country: string;
  readonly city?: string;
  readonly region?: string;
}

export interface JobPosting {
  readonly id: string;
  readonly source: SourceReference;
  readonly title: string;
  readonly company: string;
  readonly description?: string;
  readonly locations: readonly JobLocation[];
  readonly remotePolicy?: RemotePolicy;
  readonly employmentType?: EmploymentType;
  readonly seniority?: SeniorityLevel;
  readonly applicationUrl?: string;
  readonly salary?: SalaryRange;
  readonly requiredExperience?: ExperienceRange;
  readonly requiredEducation?: EducationLevel;
  readonly requiredLanguages: readonly LanguageRequirement[];
  readonly skills: readonly Skill[];
  readonly publishedAt?: string;
  readonly collectedAt: string;
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}
