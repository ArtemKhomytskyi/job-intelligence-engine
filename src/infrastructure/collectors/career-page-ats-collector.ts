import {
  CollectionError,
  type Clock,
  type CollectableSource,
  type CollectionContext,
  type CollectorResult,
  type CollectorSourceType,
  type GenericWebCollector,
  type JobCollector,
} from '../../application/index.js';

type PageAtsType = Extract<
  CollectorSourceType,
  'workable' | 'bamboohr' | 'teamtailor' | 'personio' | 'jobvite'
>;

export class CareerPageAtsCollector implements JobCollector {
  public constructor(
    public readonly sourceType: PageAtsType,
    private readonly delegate: GenericWebCollector,
    private readonly clock: Clock,
  ) {}

  public async collect(
    source: CollectableSource,
    context: CollectionContext,
  ): Promise<CollectorResult> {
    if (source.type !== this.sourceType || !('identifier' in source))
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        `${this.sourceType} collector received the wrong source type.`,
        { sourceId: source.id, retryable: false },
      );
    const started = this.clock.now().getTime();
    const delegated = await this.delegate.collect(
      {
        id: source.id,
        type: 'generic-job-list',
        displayName: source.displayName,
        enabled: source.enabled,
        company: source.company,
        requestTimeoutMs: source.requestTimeoutMs,
        requestsPerSecond: source.requestsPerSecond,
        url: source.url ?? providerUrl(source.type, source.identifier),
        browserTimeoutMs: 30_000,
        maxDiscoveredLinks: 200,
        maxTraversalDepth: 1,
        allowBrowserFallback: false,
      },
      context,
    );
    return {
      ...delegated,
      sourceType: this.sourceType,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
      diagnostics: {
        ...delegated.diagnostics,
        collectorVersion: 'career-page-v1',
        provider: this.sourceType,
      },
    };
  }
}

function providerUrl(type: PageAtsType, identifier: string): string {
  const encoded = encodeURIComponent(identifier);
  switch (type) {
    case 'workable':
      return `https://apply.workable.com/${encoded}/`;
    case 'bamboohr':
      return `https://${encoded}.bamboohr.com/careers/`;
    case 'teamtailor':
      return `https://${encoded}.teamtailor.com/jobs`;
    case 'personio':
      return `https://${encoded}.jobs.personio.de/`;
    case 'jobvite':
      return `https://jobs.jobvite.com/${encoded}/jobs`;
  }
}
