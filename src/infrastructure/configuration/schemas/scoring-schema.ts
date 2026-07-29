import { z } from 'zod';

import { percentageSchema } from './common-schema.js';

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
});

export type ScoringDocument = z.output<typeof scoringSchema>;
