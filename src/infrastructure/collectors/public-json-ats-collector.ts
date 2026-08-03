import { z } from 'zod';

import {
  CollectionError,
  normalizeCollectedJob,
  type AdditionalAtsCollectableSource,
  type Clock,
  type CollectableSource,
  type CollectedJobCandidate,
  type CollectionContext,
  type CollectorSourceType,
  type CollectorWarning,
  type HttpClient,
  type JobCollector,
} from '../../application/index.js';
import { ZodSourceDecoder } from './decoder.js';

interface JsonAtsAdapter<T> {
  readonly sourceType: Extract<
    CollectorSourceType,
    'ashby' | 'smartrecruiters' | 'recruitee'
  >;
  readonly schema: z.ZodType<T>;
  buildUrl(identifier: string): string;
  records(value: T): readonly unknown[];
  nextUrl?(value: T, currentUrl: string): string | undefined;
  detailUrl?(value: unknown): string | undefined;
  map(
    value: unknown,
    source: AdditionalAtsCollectableSource,
    detail?: unknown,
  ): CollectedJobCandidate | undefined;
}

export class PublicJsonAtsCollector<T> implements JobCollector {
  public readonly sourceType: JsonAtsAdapter<T>['sourceType'];

  public constructor(
    private readonly adapter: JsonAtsAdapter<T>,
    private readonly http: HttpClient,
    private readonly clock: Clock,
  ) {
    this.sourceType = adapter.sourceType;
  }

  public async collect(source: CollectableSource, context: CollectionContext) {
    if (source.type !== this.sourceType || !('identifier' in source))
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        `${this.sourceType} collector received the wrong source type.`,
        { sourceId: source.id, retryable: false },
      );
    const started = this.clock.now().getTime();
    let url = source.url ?? this.adapter.buildUrl(source.identifier);
    const records: unknown[] = [];
    const visited = new Set<string>();
    let requestCount = 0;
    for (let page = 0; page < 100; page += 1) {
      if (visited.has(url)) break;
      visited.add(url);
      const response = await this.http.getJson(
        request(url, source, context),
        new ZodSourceDecoder(this.adapter.schema),
      );
      requestCount += response.attempts;
      records.push(...this.adapter.records(response.data));
      const next = this.adapter.nextUrl?.(response.data, url);
      if (next === undefined) break;
      url = next;
    }
    const candidates = [];
    const warnings: CollectorWarning[] = [];
    const seen = new Set<string>();
    let invalidJobCount = 0;
    for (const record of records) {
      let detail: unknown;
      const detailUrl = this.adapter.detailUrl?.(record);
      if (detailUrl !== undefined)
        try {
          const response = await this.http.getJson(
            request(detailUrl, source, context),
            new ZodSourceDecoder(z.unknown()),
          );
          requestCount += response.attempts;
          detail = response.data;
        } catch {
          warnings.push({
            code: 'PAGE_EXTRACTION_FAILED',
            message: `${this.sourceType} job detail could not be retrieved.`,
          });
        }
      const mapped = this.adapter.map(record, source, detail);
      if (mapped === undefined || seen.has(mapped.externalId)) {
        invalidJobCount += 1;
        warnings.push({
          code:
            mapped === undefined
              ? 'JOB_NORMALIZATION_FAILED'
              : 'DUPLICATE_SOURCE_JOB',
          message:
            mapped === undefined
              ? `${this.sourceType} job shape was invalid.`
              : `Duplicate ${this.sourceType} job was ignored.`,
          ...(mapped === undefined ? {} : { externalId: mapped.externalId }),
        });
        continue;
      }
      seen.add(mapped.externalId);
      try {
        candidates.push(
          normalizeCollectedJob(source, mapped, context.collectedAt),
        );
      } catch {
        invalidJobCount += 1;
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: `${this.sourceType} job could not be normalized.`,
          externalId: mapped.externalId,
        });
      }
    }
    return {
      sourceId: source.id,
      sourceType: source.type,
      requestCount,
      rawJobCount: records.length,
      invalidJobCount,
      warnings,
      candidates,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
      diagnostics: { collectorVersion: 'public-json-v1' },
    };
  }
}

function request(
  url: string,
  source: AdditionalAtsCollectableSource,
  context: CollectionContext,
) {
  return {
    url,
    timeoutMs: source.requestTimeoutMs,
    signal: context.signal,
    rateLimitKey: new URL(url).hostname,
    minimumIntervalMs: 1_000 / source.requestsPerSecond,
  };
}

const ashbyEnvelope = z.object({ jobs: z.array(z.unknown()) }).passthrough();
const ashbyJob = z
  .object({
    id: z.string(),
    title: z.string(),
    location: z.string().optional(),
    department: z.string().optional(),
    team: z.string().optional(),
    descriptionHtml: z.string().optional(),
    jobUrl: z.string(),
    applyUrl: z.string().optional(),
    publishedAt: z.string().optional(),
    employmentType: z.string().optional(),
    workplaceType: z.string().optional(),
  })
  .passthrough();

const smartRecruitersEnvelope = z
  .object({
    content: z.array(z.unknown()),
    totalFound: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  })
  .passthrough();
const smartRecruitersDetail = z
  .object({
    postingUrl: z.string().optional(),
    applyUrl: z.string().optional(),
    jobAd: z
      .object({
        sections: z
          .object({
            companyDescription: z.object({ text: z.string() }).optional(),
            jobDescription: z.object({ text: z.string() }).optional(),
            qualifications: z.object({ text: z.string() }).optional(),
            additionalInformation: z.object({ text: z.string() }).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();
const smartRecruitersJob = z
  .object({
    id: z.string(),
    name: z.string(),
    ref: z.string(),
    releasedDate: z.string().optional(),
    location: z
      .object({
        city: z.string().optional(),
        region: z.string().optional(),
        country: z.string().optional(),
        remote: z.boolean().optional(),
      })
      .optional(),
    department: z.object({ label: z.string().optional() }).optional(),
    typeOfEmployment: z.object({ label: z.string().optional() }).optional(),
  })
  .passthrough();

const recruiteeEnvelope = z
  .object({ offers: z.array(z.unknown()) })
  .passthrough();
const recruiteeJob = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    careers_url: z.string(),
    careers_apply_url: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    department: z.string().optional(),
    employment_type: z.string().optional(),
    remote: z.boolean().optional(),
    published_at: z.string().optional(),
  })
  .passthrough();

export function createAshbyCollector(http: HttpClient, clock: Clock) {
  return new PublicJsonAtsCollector(
    {
      sourceType: 'ashby',
      schema: ashbyEnvelope,
      buildUrl: (identifier) =>
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(identifier)}?includeCompensation=true`,
      records: (value) => value.jobs,
      map: (value, source) => {
        const parsed = ashbyJob.safeParse(value);
        if (!parsed.success) return undefined;
        const job = parsed.data;
        const department = job.department ?? job.team;
        return {
          externalId: job.id,
          title: job.title,
          company: source.company,
          sourceUrl: job.jobUrl,
          applicationUrl: job.applyUrl ?? job.jobUrl,
          ...(job.descriptionHtml === undefined
            ? {}
            : { description: job.descriptionHtml }),
          ...(job.location === undefined ? {} : { locationText: job.location }),
          ...(department === undefined ? {} : { department }),
          ...(job.employmentType === undefined
            ? {}
            : { rawEmploymentType: job.employmentType }),
          ...(job.workplaceType === undefined
            ? {}
            : { rawWorkplaceType: job.workplaceType }),
          ...(job.publishedAt === undefined
            ? {}
            : { publishedAt: job.publishedAt }),
        };
      },
    },
    http,
    clock,
  );
}

export function createSmartRecruitersCollector(http: HttpClient, clock: Clock) {
  return new PublicJsonAtsCollector(
    {
      sourceType: 'smartrecruiters',
      schema: smartRecruitersEnvelope,
      buildUrl: (identifier) =>
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings?limit=100&offset=0`,
      records: (value) => value.content,
      nextUrl: (value, currentUrl) => {
        const offset = value.offset ?? 0;
        const consumed = value.content.length;
        if (
          consumed === 0 ||
          offset + consumed >= (value.totalFound ?? consumed)
        )
          return undefined;
        const next = new URL(currentUrl);
        next.searchParams.set('offset', String(offset + consumed));
        next.searchParams.set('limit', String(value.limit ?? 100));
        return next.toString();
      },
      detailUrl: (value) => {
        const parsed = smartRecruitersJob.safeParse(value);
        return parsed.success ? parsed.data.ref : undefined;
      },
      map: (value, source, rawDetail) => {
        const parsed = smartRecruitersJob.safeParse(value);
        if (!parsed.success) return undefined;
        const job = parsed.data;
        const detail = smartRecruitersDetail.safeParse(rawDetail);
        const sections = detail.success
          ? detail.data.jobAd?.sections
          : undefined;
        const description = [
          section('Company', sections?.companyDescription?.text),
          section('Job description', sections?.jobDescription?.text),
          section('Qualifications', sections?.qualifications?.text),
          section(
            'Additional information',
            sections?.additionalInformation?.text,
          ),
        ]
          .filter((item): item is string => item !== undefined)
          .join('\n\n');
        const sourceUrl =
          (detail.success ? detail.data.postingUrl : undefined) ?? job.ref;
        const location = [
          job.location?.city,
          job.location?.region,
          job.location?.country,
        ]
          .filter((item): item is string => item !== undefined)
          .join(', ');
        return {
          externalId: job.id,
          title: job.name,
          company: source.company,
          sourceUrl,
          applicationUrl:
            (detail.success ? detail.data.applyUrl : undefined) ?? sourceUrl,
          ...(description.length === 0 ? {} : { description }),
          ...(location.length === 0 ? {} : { locationText: location }),
          ...(job.department?.label === undefined
            ? {}
            : { department: job.department.label }),
          ...(job.typeOfEmployment?.label === undefined
            ? {}
            : { rawEmploymentType: job.typeOfEmployment.label }),
          ...(job.location?.remote === true
            ? { rawWorkplaceType: 'remote' }
            : {}),
          ...(job.releasedDate === undefined
            ? {}
            : { publishedAt: job.releasedDate }),
        };
      },
    },
    http,
    clock,
  );
}

function section(
  heading: string,
  value: string | undefined,
): string | undefined {
  return value === undefined || value.trim().length === 0
    ? undefined
    : `${heading}:\n${value}`;
}

export function createRecruiteeCollector(http: HttpClient, clock: Clock) {
  return new PublicJsonAtsCollector(
    {
      sourceType: 'recruitee',
      schema: recruiteeEnvelope,
      buildUrl: (identifier) =>
        `https://${encodeURIComponent(identifier)}.recruitee.com/api/offers/`,
      records: (value) => value.offers,
      map: (value, source) => {
        const parsed = recruiteeJob.safeParse(value);
        if (!parsed.success) return undefined;
        const job = parsed.data;
        return {
          externalId: String(job.id),
          title: job.title,
          company: source.company,
          sourceUrl: job.careers_url,
          applicationUrl: job.careers_apply_url ?? job.careers_url,
          ...(job.description === undefined
            ? {}
            : { description: job.description }),
          ...(job.location === undefined ? {} : { locationText: job.location }),
          ...(job.department === undefined
            ? {}
            : { department: job.department }),
          ...(job.employment_type === undefined
            ? {}
            : { rawEmploymentType: job.employment_type }),
          ...(job.remote === undefined
            ? {}
            : { rawWorkplaceType: job.remote ? 'remote' : 'onsite' }),
          ...(job.published_at === undefined
            ? {}
            : { publishedAt: job.published_at }),
        };
      },
    },
    http,
    clock,
  );
}
