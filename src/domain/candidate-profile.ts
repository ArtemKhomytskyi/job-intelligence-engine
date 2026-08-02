import type {
  EducationLevel,
  EmploymentType,
  LanguageProficiency,
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

export interface CandidateProfile {
  readonly id: string;
  readonly displayName: string;
  readonly headline?: string;
  readonly summary?: string;
  readonly education: readonly EducationRecord[];
  readonly professionalExperienceSummary: string;
  readonly totalYearsExperience?: number;
  readonly skills: readonly Skill[];
  readonly languages: readonly LanguageRequirement[];
  readonly citizenships: readonly string[];
  readonly workAuthorizations: readonly WorkAuthorization[];
  readonly preferredEmploymentTypes: readonly EmploymentType[];
  readonly location: CandidateLocation;
}
