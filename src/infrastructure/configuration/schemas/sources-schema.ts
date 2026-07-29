import { z } from 'zod';

import { idSchema, nonEmptyStringSchema, urlSchema } from './common-schema.js';

const commonSourceFields = {
  id: idSchema,
  enabled: z.boolean(),
  displayName: nonEmptyStringSchema,
  tags: z.array(nonEmptyStringSchema),
  trackIds: z.array(idSchema),
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

const genericJsonLdSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('generic-jsonld'),
  settings: z.strictObject({ url: urlSchema }),
});

const genericPageSchema = z.strictObject({
  ...commonSourceFields,
  type: z.literal('generic-page'),
  settings: z.strictObject({ url: urlSchema }),
});

export const sourcesSchema = z.strictObject({
  sources: z.array(
    z.discriminatedUnion('type', [
      greenhouseSchema,
      leverSchema,
      genericJsonLdSchema,
      genericPageSchema,
    ]),
  ),
});

export type SourcesDocument = z.output<typeof sourcesSchema>;
