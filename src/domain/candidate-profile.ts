import type {
  EducationLevel,
  EmploymentType,
  LanguageProficiency,
  RemotePolicy,
  SeniorityLevel,
} from './categories.js';

export interface EducationRecord {
  readonly level: EducationLevel;
  readonly field: string;
  readonly institution?: string;
}

export interface Skill {
  readonly name: string;
  readonly yearsOfExperience?: number;
}

export interface LanguageRequirement {
  readonly code: string;
  readonly name: string;
  readonly proficiency: LanguageProficiency;
}

export type WorkAuthorizationStatus =
  'citizen' | 'permanent' | 'authorized' | 'sponsorship-required';

export interface WorkAuthorization {
  readonly country: string;
  readonly status: WorkAuthorizationStatus;
}

export interface CandidateLocation {
  readonly country: string;
  readonly city?: string;
  readonly willingToRelocate: boolean;
  readonly relocationCountries: readonly string[];
}

export interface RoleExperience {
  readonly roleFamily: string;
  readonly years: number;
}

export interface CandidateExperienceProfile {
  readonly roleFamilies: readonly RoleExperience[];
  readonly managementYears?: number;
  readonly internshipYears?: number;
}

export interface CandidateTargetRoles {
  readonly primaryTitles: readonly string[];
  readonly secondaryTitles: readonly string[];
  readonly adjacentTitles: readonly string[];
  readonly exploratoryTitles: readonly string[];
  readonly excludedTitles: readonly string[];
  readonly excludedTitlePhrases: readonly string[];
  readonly roleFamilies: readonly string[];
  readonly excludedRoleFamilies: readonly string[];
  readonly titleAliases: readonly {
    readonly canonical: string;
    readonly aliases: readonly string[];
  }[];
}

export interface CandidateCapabilities {
  readonly programmingLanguages: readonly Skill[];
  readonly technicalSkills: readonly Skill[];
  readonly domainSkills: readonly Skill[];
  readonly toolsAndPlatforms: readonly Skill[];
  readonly certifications: readonly string[];
}

export interface CandidateEvidencePreferences {
  readonly strongPositive: readonly string[];
  readonly moderatePositive: readonly string[];
  readonly strongNegative: readonly string[];
  readonly moderateNegative: readonly string[];
  readonly mandatoryConcepts: readonly string[];
  readonly prohibitedConcepts: readonly string[];
}

export interface CandidateCareerPreferences {
  readonly preferredIndustries: readonly string[];
  readonly acceptableIndustries: readonly string[];
  readonly excludedIndustries: readonly string[];
  readonly preferredCompanyStages: readonly string[];
  readonly preferredCompanySizes: readonly string[];
  readonly preferredCompanies: readonly string[];
  readonly excludedCompanies: readonly string[];
  readonly preferredRemotePolicies: readonly RemotePolicy[];
  readonly onsiteTolerance: boolean;
  readonly preferredCountries: readonly string[];
  readonly preferredRegions: readonly string[];
  readonly needsVisaSponsorship: boolean;
  readonly minimumSalary?: number;
  readonly travelTolerancePercent?: number;
}

export interface CandidateProfile {
  readonly id: string;
  readonly displayName: string;
  readonly headline?: string;
  readonly summary?: string;
  readonly education: readonly EducationRecord[];
  readonly professionalExperienceSummary: string;
  readonly totalYearsExperience?: number;
  readonly experience?: CandidateExperienceProfile;
  readonly currentSeniority?: SeniorityLevel;
  readonly maximumTargetSeniority?: SeniorityLevel;
  readonly allowSeniorityStretch?: boolean;
  readonly skills: readonly Skill[];
  readonly capabilities?: CandidateCapabilities;
  readonly targetRoles?: CandidateTargetRoles;
  readonly careerPreferences?: CandidateCareerPreferences;
  readonly evidencePreferences?: CandidateEvidencePreferences;
  readonly languages: readonly LanguageRequirement[];
  readonly citizenships: readonly string[];
  readonly workAuthorizations: readonly WorkAuthorization[];
  readonly preferredEmploymentTypes: readonly EmploymentType[];
  readonly location: CandidateLocation;
}
