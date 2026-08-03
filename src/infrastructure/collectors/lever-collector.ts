import { z } from 'zod';
import {
  CollectionError,
  normalizeCollectedJob,
  type Clock,
  type CollectableSource,
  type CollectionContext,
  type CollectorWarning,
  type HttpClient,
  type JobCollector,
} from '../../application/index.js';
import { ZodSourceDecoder } from './decoder.js';

const envelopeSchema = z.array(z.unknown());
const jobSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    applyUrl: z.string().optional(),
    createdAt: z.number().optional(),
    description: z.string().optional(),
    descriptionPlain: z.string().optional(),
    additional: z.string().optional(),
    lists: z
      .array(
        z.object({
          text: z.string().optional(),
          content: z.string().optional(),
        }),
      )
      .optional(),
    workplaceType: z.string().optional(),
    categories: z
      .object({
        location: z.string().optional(),
        team: z.string().optional(),
        commitment: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export class LeverCollector implements JobCollector {
  public readonly sourceType = 'lever' as const;
  public constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
  ) {}
  public async collect(source: CollectableSource, context: CollectionContext) {
    if (source.type !== this.sourceType)
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Lever collector received the wrong source type.',
        { sourceId: source.id, retryable: false },
      );
    const started = this.clock.now().getTime();
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(source.companySlug)}?mode=json`;
    const response = await this.http.getJson(
      {
        url,
        timeoutMs: source.requestTimeoutMs,
        signal: context.signal,
        rateLimitKey: source.id,
        minimumIntervalMs: 1_000 / source.requestsPerSecond,
      },
      new ZodSourceDecoder(envelopeSchema),
    );
    const candidates = [];
    const warnings: CollectorWarning[] = [];
    let invalidJobCount = 0;
    const seen = new Set<string>();
    for (const raw of response.data) {
      const parsed = jobSchema.safeParse(raw);
      if (!parsed.success) {
        invalidJobCount += 1;
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: 'Lever job shape was invalid.',
        });
        continue;
      }
      const job = parsed.data;
      if (seen.has(job.id)) {
        invalidJobCount += 1;
        warnings.push({
          code: 'DUPLICATE_SOURCE_JOB',
          message: 'Duplicate Lever job was ignored.',
          externalId: job.id,
        });
        continue;
      }
      seen.add(job.id);
      try {
        const description = leverDescription(job);
        candidates.push(
          normalizeCollectedJob(
            source,
            {
              externalId: job.id,
              title: job.text,
              company: source.company,
              sourceUrl: job.hostedUrl,
              ...(job.applyUrl === undefined
                ? {}
                : { applicationUrl: job.applyUrl }),
              ...(description === undefined ? {} : { description }),
              ...(job.categories?.location === undefined
                ? {}
                : { locationText: job.categories.location }),
              ...(job.categories?.team === undefined
                ? {}
                : { department: job.categories.team }),
              ...(job.categories?.commitment === undefined
                ? {}
                : { rawEmploymentType: job.categories.commitment }),
              ...(job.workplaceType === undefined
                ? {}
                : { rawWorkplaceType: job.workplaceType }),
              ...(job.createdAt === undefined
                ? {}
                : { publishedAt: new Date(job.createdAt).toISOString() }),
            },
            context.collectedAt,
          ),
        );
      } catch {
        invalidJobCount += 1;
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: 'Lever job could not be normalized.',
          externalId: job.id,
        });
      }
    }
    return {
      sourceId: source.id,
      sourceType: source.type,
      requestCount: response.attempts,
      rawJobCount: response.data.length,
      invalidJobCount,
      warnings,
      candidates,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
    };
  }
}

function leverDescription(job: {
  readonly description?: string | undefined;
  readonly descriptionPlain?: string | undefined;
  readonly additional?: string | undefined;
  readonly lists?:
    | readonly {
        readonly text?: string | undefined;
        readonly content?: string | undefined;
      }[]
    | undefined;
}): string | undefined {
  const sections = [
    job.description ?? job.descriptionPlain,
    ...(job.lists ?? []).map((list) =>
      [
        list.text === undefined
          ? undefined
          : `<h2>${escapeHtml(list.text)}</h2>`,
        list.content,
      ]
        .filter((value): value is string => value !== undefined)
        .join('\n'),
    ),
    job.additional,
  ].filter(
    (value): value is string => value !== undefined && value.trim().length > 0,
  );
  return sections.length === 0 ? undefined : sections.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
