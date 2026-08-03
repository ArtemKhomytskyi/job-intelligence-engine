import type {
  EducationLevel,
  EmploymentType,
  LanguageProficiency,
  RemotePolicy,
  SeniorityLevel,
} from './categories.js';
import type { JobLocation, JsonValue } from './job-posting.js';

export const NORMALIZATION_VERSION = 'normalization-v2';
export const FILTER_RULES_VERSION = 'hard-filters-v1';
export const PROCESSING_FINGERPRINT_VERSION = 1;

export type RequirementLevel =
  'REQUIRED' | 'PREFERRED' | 'OPTIONAL' | 'UNKNOWN';
export type RemoteScope =
  | 'WORLDWIDE'
  | 'EU'
  | 'EEA'
  | 'EUROPE'
  | 'COUNTRY'
  | 'REGION'
  | 'TIMEZONE'
  | 'UNSPECIFIED';

export type DescriptionExtractionStrategy =
  | 'StructuredData'
  | 'SemanticSection'
  | 'BulletPattern'
  | 'SentencePattern'
  | 'TechnologyDictionary'
  | 'RegexYears'
  | 'RegexEducation'
  | 'RegexLanguage'
  | 'RegexCompensation'
  | 'RegexPolicy';

export interface ExtractionProvenance {
  readonly source: string;
  readonly strategy: DescriptionExtractionStrategy;
  readonly confidence: number;
}

export interface ProcessableJob {
  readonly id: string;
  readonly sourceId?: string;
  readonly externalId?: string;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly applicationUrl?: string;
  readonly title: string;
  readonly company: string;
  readonly description?: string;
  readonly locations: readonly JobLocation[];
  readonly remotePolicy?: RemotePolicy;
  readonly employmentType?: EmploymentType;
  readonly salaryMinimum?: number;
  readonly salaryMaximum?: number;
  readonly salaryCurrency?: string;
  readonly salaryPeriod?: string;
  readonly publishedAt?: string;
  readonly expiresAt?: string;
  readonly firstSeenAt: string;
  readonly lastCollectedAt: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly inputRevisionNumber: number;
}

export type NormalizationIssueCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INPUT_TRUNCATED'
  | 'AMBIGUOUS_LOCATION'
  | 'UNPARSEABLE_SALARY'
  | 'UNKNOWN_EMPLOYMENT_TYPE'
  | 'UNKNOWN_LANGUAGE_LEVEL'
  | 'CONFLICTING_REMOTE_POLICY'
  | 'INVALID_APPLICATION_URL';

export interface NormalizationIssue {
  readonly code: NormalizationIssueCode;
  readonly field: string;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly details: string;
  readonly evidence?: string;
}

export interface NormalizedLocation {
  readonly originalText?: string;
  readonly city?: string;
  readonly region?: string;
  readonly countryCode?: string;
  readonly countryCodes: readonly string[];
  readonly remotePolicy: RemotePolicy | 'unspecified';
  readonly remoteScope: RemoteScope;
  readonly normalizedKey: string;
}

export interface NormalizedExperienceRequirement {
  readonly minimumYears?: number;
  readonly maximumYears?: number;
  readonly level: RequirementLevel;
  readonly evidence: string;
  readonly extraction?: ExtractionProvenance;
}

export interface NormalizedEducationRequirement {
  readonly level: EducationLevel;
  readonly requirement: RequirementLevel;
  readonly acceptsEquivalentExperience: boolean;
  readonly evidence: string;
  readonly extraction?: ExtractionProvenance;
}

export interface NormalizedLanguageRequirement {
  readonly code: string;
  readonly name: string;
  readonly proficiency: LanguageProficiency;
  readonly requirement: RequirementLevel;
  readonly nativeRequired: boolean;
  readonly evidence: string;
  readonly extraction?: ExtractionProvenance;
}

export interface NormalizedSkillRequirement {
  readonly canonicalName: string;
  readonly originalSpelling: string;
  readonly requirement: RequirementLevel;
  readonly evidence: string;
  readonly category?: TechnologyCategory;
  readonly extraction?: ExtractionProvenance;
}

export type TechnologyCategory =
  | 'PROGRAMMING_LANGUAGE'
  | 'FRAMEWORK'
  | 'CLOUD_PROVIDER'
  | 'DATABASE'
  | 'PLATFORM'
  | 'PROTOCOL'
  | 'PRACTICE';

export interface NormalizedSalary {
  readonly minimumAmount?: number;
  readonly maximumAmount?: number;
  readonly currency?: string;
  readonly period:
    'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CONTRACT' | 'UNSPECIFIED';
  readonly grossNet: 'GROSS' | 'NET' | 'UNSPECIFIED';
  readonly kind: 'EXACT' | 'RANGE' | 'STARTING' | 'MAXIMUM' | 'UNKNOWN';
  readonly originalText?: string;
  readonly parsingStatus: 'STRUCTURED' | 'PARSED' | 'UNPARSEABLE';
}

export interface WorkAuthorizationRequirement {
  readonly countryCode?: string;
  readonly countryGroup?: 'EU' | 'EEA';
  readonly sponsorshipAvailable: boolean | 'UNKNOWN';
  readonly citizenshipOnly: boolean;
  readonly securityClearanceRequired: boolean;
  readonly evidence: string;
  readonly extraction?: ExtractionProvenance;
}

export interface ExtractedTextFact {
  readonly value: string;
  readonly requirement: RequirementLevel;
  readonly evidence: string;
  readonly extraction: ExtractionProvenance;
}

export interface ExtractedEmploymentFact {
  readonly value: EmploymentType;
  readonly evidence: string;
  readonly extraction: ExtractionProvenance;
}

export interface ExtractedRemoteFact {
  readonly value: RemotePolicy;
  readonly scope?: RemoteScope;
  readonly evidence: string;
  readonly extraction: ExtractionProvenance;
}

export interface ExtractedTravelRequirement {
  readonly required: boolean;
  readonly maximumPercentage?: number;
  readonly evidence: string;
  readonly extraction: ExtractionProvenance;
}

export interface ExtractedBooleanPolicy {
  readonly value: boolean | 'UNKNOWN';
  readonly evidence: string;
  readonly extraction: ExtractionProvenance;
}

export interface JobDescriptionAnalysis {
  readonly technologyRequirements: readonly NormalizedSkillRequirement[];
  readonly experienceRequirements: readonly NormalizedExperienceRequirement[];
  readonly educationRequirements: readonly NormalizedEducationRequirement[];
  readonly languageRequirements: readonly NormalizedLanguageRequirement[];
  readonly workAuthorizationRequirements: readonly WorkAuthorizationRequirement[];
  readonly certifications: readonly ExtractedTextFact[];
  readonly benefits: readonly ExtractedTextFact[];
  readonly responsibilities: readonly ExtractedTextFact[];
  readonly requiredQualifications: readonly ExtractedTextFact[];
  readonly preferredQualifications: readonly ExtractedTextFact[];
  readonly niceToHaveQualifications: readonly ExtractedTextFact[];
  readonly employmentTypes: readonly ExtractedEmploymentFact[];
  readonly contractTypes: readonly ExtractedTextFact[];
  readonly remotePolicies: readonly ExtractedRemoteFact[];
  readonly travelRequirements: readonly ExtractedTravelRequirement[];
  readonly salaryMentions: readonly ExtractedTextFact[];
  readonly visaSponsorship: readonly ExtractedBooleanPolicy[];
  readonly securityClearance: readonly ExtractedBooleanPolicy[];
  readonly relocationSupport: readonly ExtractedBooleanPolicy[];
}

export interface EnrichedNormalizedJob {
  readonly id: string;
  readonly inputRevisionNumber: number;
  readonly sourceId?: string;
  readonly externalId?: string;
  readonly sourceUrl: string;
  readonly applicationUrl?: string;
  readonly canonicalApplicationUrl: string;
  readonly originalTitle: string;
  readonly cleanedTitle: string;
  readonly normalizedTitle: string;
  readonly titleComparisonKey: string;
  readonly seniority?: SeniorityLevel;
  readonly seniorityEvidence?: string;
  readonly originalCompany: string;
  readonly normalizedCompany: string;
  readonly companyComparisonKey: string;
  readonly location: NormalizedLocation;
  readonly employmentType?: EmploymentType;
  readonly industry?: string;
  readonly department?: string;
  readonly office?: string;
  readonly experienceRequirements: readonly NormalizedExperienceRequirement[];
  readonly educationRequirements: readonly NormalizedEducationRequirement[];
  readonly languageRequirements: readonly NormalizedLanguageRequirement[];
  readonly skillRequirements: readonly NormalizedSkillRequirement[];
  readonly workAuthorizationRequirements: readonly WorkAuthorizationRequirement[];
  readonly descriptionAnalysis?: JobDescriptionAnalysis;
  readonly description?: string;
  readonly salaryMinimum?: number;
  readonly salaryMaximum?: number;
  readonly salaryCurrency?: string;
  readonly salaryPeriod?: string;
  readonly salary?: NormalizedSalary;
  readonly publishedAt?: string;
  readonly expiresAt?: string;
  readonly firstSeenAt: string;
  readonly lastCollectedAt: string;
  readonly normalizationVersion: typeof NORMALIZATION_VERSION;
  readonly normalizedAt: string;
}

export type NormalizationResult =
  | {
      readonly status: 'SUCCESS';
      readonly job: EnrichedNormalizedJob;
      readonly issues: readonly NormalizationIssue[];
    }
  | {
      readonly status: 'FAILED';
      readonly issues: readonly NormalizationIssue[];
    };

export type DuplicateMatchLayer =
  | 'SOURCE_EXTERNAL_ID'
  | 'CANONICAL_APPLICATION_URL'
  | 'COMPANY_TITLE_LOCATION'
  | 'STABLE_FINGERPRINT';

export interface DuplicateEvidence {
  readonly layer: DuplicateMatchLayer;
  readonly matchedJobId: string;
  readonly details: string;
  readonly comparedValues: Readonly<Record<string, string | null>>;
}

export type DuplicateDecision =
  | {
      readonly decision: 'UNIQUE';
      readonly evidence: readonly DuplicateEvidence[];
    }
  | {
      readonly decision: 'DUPLICATE';
      readonly primaryJobId: string;
      readonly evidence: readonly DuplicateEvidence[];
    }
  | {
      readonly decision: 'POSSIBLE_DUPLICATE';
      readonly candidateJobIds: readonly string[];
      readonly evidence: readonly DuplicateEvidence[];
    };

export type HardFilterReasonCode =
  | 'COUNTRY_NOT_ALLOWED'
  | 'WORK_AUTHORIZATION_NOT_AVAILABLE'
  | 'MISSING_REQUIRED_LANGUAGE'
  | 'SENIORITY_EXCEEDS_MAXIMUM'
  | 'EXPERIENCE_EXCEEDS_MAXIMUM'
  | 'PHD_REQUIRED'
  | 'EXCLUDED_COMPANY'
  | 'EXCLUDED_INDUSTRY'
  | 'EXCLUDED_TITLE_PATTERN'
  | 'JOB_EXPIRED';

export interface HardFilterReason {
  readonly code: HardFilterReasonCode;
  readonly filterId: string;
  readonly details: string;
  readonly evidence?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

export type HardFilterResult =
  | { readonly decision: 'ELIGIBLE'; readonly reasons: readonly [] }
  | {
      readonly decision: 'REJECTED';
      readonly reasons: readonly HardFilterReason[];
    };
