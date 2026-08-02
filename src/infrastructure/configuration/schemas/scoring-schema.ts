import { z } from 'zod';

import { percentageSchema } from './common-schema.js';

const aliasSchema = z.strictObject({
  canonical: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
});

const defaultSettings = {
  titleAliases: [],
  skillAliases: [],
  experienceToleranceYears: 1,
  freshnessFullScoreDays: 3,
  freshnessHorizonDays: 60,
  sourceQuality: {
    greenhouse: 90,
    lever: 90,
    'generic-jsonld': 80,
    'generic-page': 70,
    'generic-job-list': 60,
  },
  selector: {
    maximumSameTitle: 3,
    unknownCompanyJobsShareCap: false,
  },
};

export const scoringSchema = z.strictObject({
  weights: z.strictObject({
    titleRelevance: percentageSchema,
    skills: percentageSchema,
    experience: percentageSchema,
    location: percentageSchema,
    workAuthorization: percentageSchema,
    education: percentageSchema,
    language: percentageSchema,
    companyPreference: percentageSchema,
    freshness: percentageSchema,
    salary: percentageSchema,
    sourceQuality: percentageSchema,
    applicationSimplicity: percentageSchema,
  }),
  settings: z
    .strictObject({
      titleAliases: z.array(aliasSchema).max(500),
      skillAliases: z.array(aliasSchema).max(500),
      experienceToleranceYears: z.number().finite().min(0).max(20),
      freshnessFullScoreDays: z.number().int().min(0).max(365),
      freshnessHorizonDays: z.number().int().positive().max(3_650),
      sourceQuality: z.record(z.string().trim().min(1), percentageSchema),
      selector: z.strictObject({
        maximumSameTitle: z.number().int().positive().max(1_000),
        unknownCompanyJobsShareCap: z.boolean(),
      }),
    })
    .default(defaultSettings),
});

export type ScoringDocument = z.output<typeof scoringSchema>;
