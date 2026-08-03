import { z } from 'zod';

import {
  idSchema,
  nonEmptyStringSchema,
  publicHttpsUrlSchema,
  urlSchema,
} from './common-schema.js';

const commonSourceFields = {
  id: idSchema,
  enabled: z.boolean(),
  displayName: nonEmptyStringSchema,
  tags: z.array(nonEmptyStringSchema),
  trackIds: z.array(idSchema),
  trackPolicy: z
    .enum(['strict', 'preferred', 'unrestricted'])
    .default('strict'),
  company: nonEmptyStringSchema.optional(),
  requestTimeoutMs: z.number().int().min(1_000).max(60_000).optional(),
  requestsPerSecond: z.number().positive().max(10).optional(),
};

const greenhouseSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('greenhouse'),
  settings: z.strictObject({
    boardToken: nonEmptyStringSchema,
    boardUrl: urlSchema.optional(),
  }),
});

const leverSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('lever'),
  settings: z.strictObject({
    companySlug: nonEmptyStringSchema,
    jobsUrl: urlSchema.optional(),
  }),
});

const additionalAtsTypes = [
  'ashby',
  'smartrecruiters',
  'workable',
  'bamboohr',
  'recruitee',
  'teamtailor',
  'personio',
  'jobvite',
] as const;

const additionalAtsSchemas = additionalAtsTypes.map((type) =>
  z.strictObject({
    ...commonSourceFields,
    type: z.literal(type),
    settings: z.strictObject({
      identifier: nonEmptyStringSchema,
      url: publicHttpsUrlSchema.optional(),
    }),
  }),
);

const companySchema = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean().default(true),
  careersUrl: publicHttpsUrlSchema.optional(),
  websiteUrl: publicHttpsUrlSchema.optional(),
  tags: z.array(nonEmptyStringSchema).default([]),
  trackIds: z.array(idSchema).default([]),
  trackPolicy: z
    .enum(['strict', 'preferred', 'unrestricted'])
    .default('preferred'),
  sourceOverride: z
    .strictObject({
      type: z.enum([
        'greenhouse',
        'lever',
        ...additionalAtsTypes,
        'generic-page',
        'generic-job-list',
      ]),
      identifier: nonEmptyStringSchema.optional(),
      url: publicHttpsUrlSchema.optional(),
    })
    .optional(),
});

const genericJsonLdSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('generic-jsonld'),
  settings: z.strictObject({ url: urlSchema }),
});

const genericWebSettings = z.strictObject({
  url: publicHttpsUrlSchema,
  browserTimeoutMs: z.number().int().min(3_000).max(90_000).optional(),
  maxDiscoveredLinks: z.number().int().min(1).max(200).optional(),
  maxTraversalDepth: z.number().int().min(0).max(2).optional(),
  allowBrowserFallback: z.boolean().optional(),
});

const genericPageSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('generic-page'),
  settings: genericWebSettings,
});

const genericJobListSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('generic-job-list'),
  settings: genericWebSettings,
});

export const sourcesSchema = z.strictObject({
  sources: z
    .array(
      z.discriminatedUnion('type', [
        greenhouseSchema,
        leverSchema,
        ...additionalAtsSchemas,
        genericJsonLdSchema,
        genericPageSchema,
        genericJobListSchema,
      ]),
    )
    .default([]),
  companies: z.array(companySchema).default([]),
});

export type SourcesDocument = z.output<typeof sourcesSchema>;
