import { z } from 'zod';

import {
  companySizeSchema,
  countryCodeSchema,
  employmentTypeSchema,
  experienceRangeSchema,
  idSchema,
  nonEmptyStringSchema,
  percentageSchema,
  remotePolicySchema,
  salaryRangeSchema,
  seniorityLevelSchema,
} from './common-schema.js';

const searchTrackSchema = z.strictObject({
  id: idSchema,
  displayName: nonEmptyStringSchema,
  enabled: z.boolean(),
  targetTitles: z.array(nonEmptyStringSchema).min(1),
  adjacentTitles: z.array(nonEmptyStringSchema).default([]),
  excludedTitles: z.array(nonEmptyStringSchema).default([]),
  roleFamilies: z.array(idSchema).default([]),
  excludedRoleFamilies: z.array(idSchema).default([]),
  includeKeywords: z.array(nonEmptyStringSchema),
  excludeKeywords: z.array(nonEmptyStringSchema),
  requiredEvidence: z.array(nonEmptyStringSchema).default([]),
  preferredEvidence: z.array(nonEmptyStringSchema).default([]),
  negativeEvidence: z.array(nonEmptyStringSchema).default([]),
  requiredSkills: z.array(nonEmptyStringSchema).default([]),
  preferredSkills: z.array(nonEmptyStringSchema),
  optionalSkills: z.array(nonEmptyStringSchema).default([]),
  excludedSkills: z.array(nonEmptyStringSchema).default([]),
  preferredIndustries: z.array(nonEmptyStringSchema),
  roleSpecificExperienceYears: z.number().finite().min(0).max(80).optional(),
  acceptableSeniorities: z.array(seniorityLevelSchema).default([]),
  preferredCountries: z.array(countryCodeSchema).default([]),
  preferredRemotePolicies: z.array(remotePolicySchema).default([]),
  minimumScore: percentageSchema.optional(),
  priority: z.number().finite().positive(),
  recommendationQuota: z.number().int().positive().optional(),
});

const hardFiltersSchema = z.strictObject({
  allowedCountries: z.array(countryCodeSchema).max(250),
  allowedCountryGroups: z.array(z.enum(['EU', 'EEA', 'EUROPE'])).max(3),
  rejectUnknownLocation: z.boolean(),
  unknownCandidateLanguageLevelPolicy: z.enum(['allow', 'reject']),
  maximumSeniority: seniorityLevelSchema,
  maximumRequiredExperienceYears: z.number().finite().min(0).max(80),
  maximumRequiredExperienceYearsIntentional: z.boolean().default(false),
  allowMandatoryPhd: z.boolean(),
  excludedCompanies: z.array(nonEmptyStringSchema.max(500)).max(1_000),
  excludedIndustries: z.array(nonEmptyStringSchema.max(500)).max(1_000),
  excludedTitlePhrases: z.array(nonEmptyStringSchema.max(100)).max(1_000),
  rejectUnknownIndustry: z.boolean(),
  removableTrackingParameters: z
    .array(nonEmptyStringSchema.regex(/^[A-Za-z0-9_.~-]+$/u))
    .max(100),
  companyLegalSuffixes: z.array(nonEmptyStringSchema.max(30)).max(100),
});

const defaultHardFilters = {
  allowedCountries: [],
  allowedCountryGroups: [],
  rejectUnknownLocation: false,
  unknownCandidateLanguageLevelPolicy: 'allow',
  maximumSeniority: 'executive',
  maximumRequiredExperienceYears: 80,
  maximumRequiredExperienceYearsIntentional: false,
  allowMandatoryPhd: true,
  excludedCompanies: [],
  excludedIndustries: [],
  excludedTitlePhrases: [],
  rejectUnknownIndustry: false,
  removableTrackingParameters: [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ],
  companyLegalSuffixes: [
    'Ltd',
    'Limited',
    'LLC',
    'Inc',
    'Incorporated',
    'GmbH',
    'AG',
    'BV',
    'PLC',
  ],
} satisfies z.output<typeof hardFiltersSchema>;

export const searchSchema = z.strictObject({
  tracks: z.array(searchTrackSchema).min(1),
  preferences: z.strictObject({
    preferredCountries: z.array(countryCodeSchema).min(1),
    allowedRemotePolicies: z.array(remotePolicySchema).min(1),
    willingToRelocate: z.boolean(),
    relocationCountries: z.array(countryCodeSchema),
    preferredCompanySizes: z.array(companySizeSchema),
    allowedEmploymentTypes: z.array(employmentTypeSchema).min(1),
    excludedSeniorityLevels: z.array(seniorityLevelSchema),
    excludedCompanies: z.array(nonEmptyStringSchema),
    excludedIndustries: z.array(nonEmptyStringSchema),
    requiredExperience: experienceRangeSchema,
    desiredSalary: salaryRangeSchema.optional(),
    dailyRecommendationLimit: z.number().int().positive(),
    minimumAcceptableScore: percentageSchema,
    maximumRecommendationsPerCompany: z.number().int().positive(),
    hardFilters: hardFiltersSchema.default(defaultHardFilters),
  }),
});

export type SearchDocument = z.output<typeof searchSchema>;
