import { CollectionError } from '../collection/errors.js';
import type { Clock, JobCollector } from '../collection/ports.js';
import { normalizeCollectedJob } from '../collection/normalization.js';
import type {
  CollectableSource,
  CollectionContext,
  CollectorSourceType,
  CollectorWarning,
} from '../collection/models.js';
import { GenericExtractionEngine } from './generic-extraction-engine.js';

export class GenericWebCollector implements JobCollector {
  public constructor(
    public readonly sourceType: Extract<
      CollectorSourceType,
      'generic-page' | 'generic-job-list'
    >,
    private readonly engine: GenericExtractionEngine,
    private readonly clock: Clock,
  ) {}

  public async collect(source: CollectableSource, context: CollectionContext) {
    if (source.type !== this.sourceType)
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Generic collector received the wrong source type.',
        { sourceId: source.id, retryable: false },
      );
    const started = this.clock.now().getTime();
    const result = await this.engine.extract({
      source,
      collectedAt: context.collectedAt,
      signal: context.signal,
    });
    const warnings: CollectorWarning[] = result.warnings.map((warning) => ({
      code: warning.startsWith('KNOWN_ATS_DETECTED')
        ? 'KNOWN_ATS_DETECTED'
        : warning === 'BROWSER_FALLBACK_FAILED'
          ? 'BROWSER_FALLBACK_FAILED'
          : warning === 'TRAVERSAL_LIMIT_REACHED'
            ? 'TRAVERSAL_LIMIT_REACHED'
            : warning === 'MALFORMED_JSON_LD'
              ? 'MALFORMED_JSON_LD'
              : 'PAGE_EXTRACTION_FAILED',
      message: warning,
    }));
    const candidates = result.jobs.flatMap((job) => {
      try {
        return [
          normalizeCollectedJob(
            source,
            {
              externalId: job.externalId ?? job.canonicalUrl,
              title: job.title,
              company: job.company,
              sourceUrl: job.canonicalUrl,
              ...(job.applicationUrl === undefined
                ? {}
                : { applicationUrl: job.applicationUrl }),
              ...(job.description === undefined
                ? {}
                : { description: job.description }),
              ...(job.locationText === undefined
                ? {}
                : { locationText: job.locationText }),
              ...(job.employmentType === undefined
                ? {}
                : { rawEmploymentType: job.employmentType }),
              ...(job.workplaceType === undefined
                ? {}
                : { rawWorkplaceType: job.workplaceType }),
              ...(job.publishedAt === undefined
                ? {}
                : { publishedAt: job.publishedAt }),
              ...(job.expiresAt === undefined
                ? {}
                : { expiresAt: job.expiresAt }),
              metadata: {
                extractionStrategy: job.strategy,
                extractionConfidence: job.confidence,
                evidence: job.evidence.map((item) => ({ ...item })),
                ...(job.metadata ?? {}),
              },
            },
            context.collectedAt,
          ),
        ];
      } catch {
        warnings.push({
          code: 'JOB_NORMALIZATION_FAILED',
          message: 'Extracted generic job could not be normalized.',
          ...(job.externalId === undefined
            ? {}
            : { externalId: job.externalId }),
        });
        return [];
      }
    });
    return {
      sourceId: source.id,
      sourceType: source.type,
      requestCount: result.requestCount,
      rawJobCount: result.jobs.length,
      invalidJobCount:
        result.invalidPageCount + (result.jobs.length - candidates.length),
      warnings,
      candidates,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
      diagnostics: {
        pagesFetched: result.pagesFetched,
        linksDiscovered: result.linksDiscovered,
        browserFallbacks: result.browserFallbackCount,
        blockedResources: result.blockedResourceCount,
      },
    };
  }
}
