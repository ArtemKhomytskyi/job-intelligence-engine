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
  readonly adjacentTitles?: readonly string[];
  readonly excludedTitles?: readonly string[];
  readonly roleFamilies?: readonly string[];
  readonly excludedRoleFamilies?: readonly string[];
  readonly includeKeywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly requiredEvidence?: readonly string[];
  readonly preferredEvidence?: readonly string[];
  readonly negativeEvidence?: readonly string[];
  readonly requiredSkills?: readonly string[];
  readonly preferredSkills: readonly string[];
  readonly optionalSkills?: readonly string[];
  readonly excludedSkills?: readonly string[];
  readonly preferredIndustries: readonly string[];
  readonly roleSpecificExperienceYears?: number;
  readonly acceptableSeniorities?: readonly SeniorityLevel[];
  readonly preferredCountries?: readonly string[];
  readonly preferredRemotePolicies?: readonly RemotePolicy[];
  readonly minimumScore?: Percentage;
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
  readonly hardFilters: HardFilterConfiguration;
}

export type CountryGroup = 'EU' | 'EEA' | 'EUROPE';
export type UnknownCandidateLanguageLevelPolicy = 'allow' | 'reject';

export interface HardFilterConfiguration {
  readonly allowedCountries: readonly string[];
  readonly allowedCountryGroups: readonly CountryGroup[];
  readonly rejectUnknownLocation: boolean;
  readonly unknownCandidateLanguageLevelPolicy: UnknownCandidateLanguageLevelPolicy;
  readonly maximumSeniority: SeniorityLevel;
  readonly maximumRequiredExperienceYears: number;
  readonly maximumRequiredExperienceYearsIntentional?: boolean;
  readonly allowMandatoryPhd: boolean;
  readonly excludedCompanies: readonly string[];
  readonly excludedIndustries: readonly string[];
  readonly excludedTitlePhrases: readonly string[];
  readonly rejectUnknownIndustry: boolean;
  readonly removableTrackingParameters: readonly string[];
  readonly companyLegalSuffixes: readonly string[];
}

export interface SearchConfiguration {
  readonly tracks: readonly SearchTrack[];
  readonly preferences: SearchPreferences;
}
