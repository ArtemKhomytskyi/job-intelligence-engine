import type {
  CompanySize,
  EmploymentType,
  RemotePolicy,
  SeniorityLevel,
} from './categories.js';
import type {
  ExperienceRange,
  Percentage,
  SalaryRange,
} from './value-objects.js';

export interface SearchTrack {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly targetTitles: readonly string[];
  readonly includeKeywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly preferredSkills: readonly string[];
  readonly preferredIndustries: readonly string[];
  readonly priority: number;
  readonly recommendationQuota?: number;
}

export interface SearchPreferences {
  readonly preferredCountries: readonly string[];
  readonly allowedRemotePolicies: readonly RemotePolicy[];
  readonly willingToRelocate: boolean;
  readonly relocationCountries: readonly string[];
  readonly preferredCompanySizes: readonly CompanySize[];
  readonly allowedEmploymentTypes: readonly EmploymentType[];
  readonly excludedSeniorityLevels: readonly SeniorityLevel[];
  readonly excludedCompanies: readonly string[];
  readonly excludedIndustries: readonly string[];
  readonly requiredExperience: ExperienceRange;
  readonly desiredSalary?: SalaryRange;
  readonly dailyRecommendationLimit: number;
  readonly minimumAcceptableScore: Percentage;
  readonly maximumRecommendationsPerCompany: number;
}

export interface SearchConfiguration {
  readonly tracks: readonly SearchTrack[];
  readonly preferences: SearchPreferences;
}
