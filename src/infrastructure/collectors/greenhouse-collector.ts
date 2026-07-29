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

const envelopeSchema = z.object({ jobs: z.array(z.unknown()) }).passthrough();
const jobSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    absolute_url: z.string(),
    content: z.string().optional(),
    updated_at: z.string().optional(),
    location: z.object({ name: z.string().optional() }).optional(),
    departments: z.array(z.object({ name: z.string() })).optional(),
  })
  .passthrough();

export class GreenhouseCollector implements JobCollector {
  public readonly sourceType = 'greenhouse' as const;
  public constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
  ) {}
  public async collect(source: CollectableSource, context: CollectionContext) {
    if (source.type !== this.sourceType)
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Greenhouse collector received the wrong source type.',
        { sourceId: source.id, retryable: false },
      );
    const started = this.clock.now().getTime();
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs?content=true`;
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
    for (const raw of response.data.jobs) {
      const parsed = jobSchema.safeParse(raw);
      if (!parsed.success) {
        invalidJobCount += 1;
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: 'Greenhouse job shape was invalid.',
        });
        continue;
      }
      const externalId = String(parsed.data.id);
      if (seen.has(externalId)) {
        invalidJobCount += 1;
        warnings.push({
          code: 'DUPLICATE_SOURCE_JOB',
          message: 'Duplicate Greenhouse job was ignored.',
          externalId,
        });
        continue;
      }
      seen.add(externalId);
      try {
        candidates.push(
          normalizeCollectedJob(
            source,
            {
              externalId,
              title: parsed.data.title,
              company: source.company,
              sourceUrl: parsed.data.absolute_url,
              applicationUrl: parsed.data.absolute_url,
              ...(parsed.data.content === undefined
                ? {}
                : { description: parsed.data.content }),
              ...(parsed.data.location?.name === undefined
                ? {}
                : { locationText: parsed.data.location.name }),
              ...(parsed.data.departments?.[0]?.name === undefined
                ? {}
                : { department: parsed.data.departments[0].name }),
              ...(parsed.data.updated_at === undefined
                ? {}
                : { metadata: { sourceUpdatedAt: parsed.data.updated_at } }),
            },
            context.collectedAt,
          ),
        );
      } catch {
        invalidJobCount += 1;
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: 'Greenhouse job could not be normalized.',
          externalId,
        });
      }
    }
    return {
      sourceId: source.id,
      sourceType: source.type,
      requestCount: response.attempts,
      rawJobCount: response.data.jobs.length,
      invalidJobCount,
      warnings,
      candidates,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
    };
  }
}
