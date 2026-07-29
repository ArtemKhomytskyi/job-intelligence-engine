import { z } from 'zod';

import {
  COMPANY_SIZES,
  CURRENCY_CODES,
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  LANGUAGE_PROFICIENCIES,
  REMOTE_POLICIES,
  SALARY_PERIODS,
  SENIORITY_LEVELS,
} from '../../../domain/index.js';

export const nonEmptyStringSchema = z.string().trim().min(1);
export const idSchema = nonEmptyStringSchema.regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
  'Use lowercase letters, numbers, and single hyphens.',
);
export const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/u, 'Use a two-letter uppercase country code.');
export const languageCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z]{2,3}$/u,
    'Use a two- or three-letter lowercase language code.',
  );
export const urlSchema = z.url();
export const percentageSchema = z.number().finite().min(0).max(100);

export const experienceRangeSchema = z.strictObject({
  minimumYears: z.number().finite().min(0),
  maximumYears: z.number().finite().min(0).optional(),
});

export const salaryRangeSchema = z
  .strictObject({
    minimum: z.number().finite().min(0).optional(),
    maximum: z.number().finite().min(0).optional(),
    currency: z.enum(CURRENCY_CODES),
    period: z.enum(SALARY_PERIODS),
  })
  .refine(
    (value) => value.minimum !== undefined || value.maximum !== undefined,
    {
      message: 'Define a salary minimum, maximum, or both.',
    },
  );

export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);
export const seniorityLevelSchema = z.enum(SENIORITY_LEVELS);
export const remotePolicySchema = z.enum(REMOTE_POLICIES);
export const companySizeSchema = z.enum(COMPANY_SIZES);
export const educationLevelSchema = z.enum(EDUCATION_LEVELS);
export const languageProficiencySchema = z.enum(LANGUAGE_PROFICIENCIES);
