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
  includeKeywords: z.array(nonEmptyStringSchema),
  excludeKeywords: z.array(nonEmptyStringSchema),
  preferredSkills: z.array(nonEmptyStringSchema),
  preferredIndustries: z.array(nonEmptyStringSchema),
  priority: z.number().finite().positive(),
  recommendationQuota: z.number().int().positive().optional(),
});

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
  }),
});

export type SearchDocument = z.output<typeof searchSchema>;
