import { z } from 'zod';

import {
  countryCodeSchema,
  companySizeSchema,
  educationLevelSchema,
  employmentTypeSchema,
  languageCodeSchema,
  languageProficiencySchema,
  nonEmptyStringSchema,
  idSchema,
  remotePolicySchema,
  seniorityLevelSchema,
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

const phraseListSchema = z.array(nonEmptyStringSchema.max(200)).max(1_000);

const aliasSchema = z.strictObject({
  canonical: nonEmptyStringSchema.max(100),
  aliases: z.array(nonEmptyStringSchema.max(100)).min(1).max(50),
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
    totalYearsExperience: z.number().finite().min(0).max(80).optional(),
    experience: z
      .strictObject({
        roleFamilies: z
          .array(
            z.strictObject({
              roleFamily: idSchema,
              years: z.number().finite().min(0).max(80),
            }),
          )
          .max(100),
        managementYears: z.number().finite().min(0).max(80).optional(),
        internshipYears: z.number().finite().min(0).max(20).optional(),
      })
      .optional(),
    currentSeniority: seniorityLevelSchema.optional(),
    maximumTargetSeniority: seniorityLevelSchema.optional(),
    allowSeniorityStretch: z.boolean().optional(),
    skills: z.array(skillSchema),
    capabilities: z
      .strictObject({
        programmingLanguages: z.array(skillSchema).max(500),
        technicalSkills: z.array(skillSchema).max(500),
        domainSkills: z.array(skillSchema).max(500),
        toolsAndPlatforms: z.array(skillSchema).max(500),
        certifications: phraseListSchema,
      })
      .optional(),
    targetRoles: z
      .strictObject({
        primaryTitles: phraseListSchema,
        secondaryTitles: phraseListSchema,
        adjacentTitles: phraseListSchema,
        exploratoryTitles: phraseListSchema,
        excludedTitles: phraseListSchema,
        excludedTitlePhrases: phraseListSchema,
        roleFamilies: z.array(idSchema).max(100),
        excludedRoleFamilies: z.array(idSchema).max(100),
        titleAliases: z.array(aliasSchema).max(500),
      })
      .optional(),
    careerPreferences: z
      .strictObject({
        preferredIndustries: phraseListSchema,
        acceptableIndustries: phraseListSchema,
        excludedIndustries: phraseListSchema,
        preferredCompanyStages: phraseListSchema,
        preferredCompanySizes: z.array(companySizeSchema),
        preferredCompanies: phraseListSchema,
        excludedCompanies: phraseListSchema,
        preferredRemotePolicies: z.array(remotePolicySchema),
        onsiteTolerance: z.boolean(),
        preferredCountries: z.array(countryCodeSchema),
        preferredRegions: phraseListSchema,
        needsVisaSponsorship: z.boolean(),
        minimumSalary: z.number().finite().nonnegative().optional(),
        travelTolerancePercent: z.number().finite().min(0).max(100).optional(),
      })
      .optional(),
    evidencePreferences: z
      .strictObject({
        strongPositive: phraseListSchema,
        moderatePositive: phraseListSchema,
        strongNegative: phraseListSchema,
        moderateNegative: phraseListSchema,
        mandatoryConcepts: phraseListSchema,
        prohibitedConcepts: phraseListSchema,
      })
      .optional(),
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
