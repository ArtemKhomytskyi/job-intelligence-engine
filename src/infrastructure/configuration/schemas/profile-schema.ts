import { z } from 'zod';

import {
  countryCodeSchema,
  educationLevelSchema,
  employmentTypeSchema,
  languageCodeSchema,
  languageProficiencySchema,
  nonEmptyStringSchema,
  idSchema,
} from './common-schema.js';

const educationSchema = z.strictObject({
  level: educationLevelSchema,
  field: nonEmptyStringSchema,
  institution: nonEmptyStringSchema.optional(),
});

const skillSchema = z.strictObject({
  name: nonEmptyStringSchema,
  yearsOfExperience: z.number().finite().min(0).optional(),
});

const languageSchema = z.strictObject({
  code: languageCodeSchema,
  name: nonEmptyStringSchema,
  proficiency: languageProficiencySchema,
});

const workAuthorizationSchema = z.strictObject({
  country: countryCodeSchema,
  status: z.enum([
    'citizen',
    'permanent',
    'authorized',
    'sponsorship-required',
  ]),
});

export const profileSchema = z.strictObject({
  candidate: z.strictObject({
    id: idSchema,
    displayName: nonEmptyStringSchema,
    headline: nonEmptyStringSchema.optional(),
    summary: nonEmptyStringSchema.optional(),
    education: z.array(educationSchema),
    professionalExperienceSummary: nonEmptyStringSchema,
    skills: z.array(skillSchema),
    languages: z.array(languageSchema),
    citizenships: z.array(countryCodeSchema),
    workAuthorizations: z.array(workAuthorizationSchema),
    preferredEmploymentTypes: z.array(employmentTypeSchema).min(1),
    location: z.strictObject({
      country: countryCodeSchema,
      city: nonEmptyStringSchema.optional(),
      willingToRelocate: z.boolean(),
      relocationCountries: z.array(countryCodeSchema),
    }),
  }),
});

export type ProfileDocument = z.output<typeof profileSchema>;
