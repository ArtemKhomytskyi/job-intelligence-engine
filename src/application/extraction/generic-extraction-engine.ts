import { CollectionError } from '../collection/errors.js';
import type { HttpRequest, Logger } from '../collection/ports.js';
import type { GenericWebCollectableSource } from '../collection/models.js';
import type {
  DiscoveredLink,
  ExtractedJob,
  GenericExtractionRequest,
  GenericExtractionResult,
  HtmlPage,
  PageExtractionResult,
} from './models.js';
import type {
  BrowserPageRenderer,
  HtmlDocumentExtractor,
  HtmlPageAcquirer,
} from './ports.js';

const MAX_STATIC_HTML_BYTES = 5 * 1024 * 1024;
const MAX_RENDERED_HTML_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_PAGES = 60;
const MAX_BROWSER_FALLBACKS = 10;
const DETAIL_CONCURRENCY = 3;

export class GenericExtractionEngine {
  public constructor(
    private readonly acquirer: HtmlPageAcquirer,
    private readonly extractor: HtmlDocumentExtractor,
    private readonly browser: BrowserPageRenderer,
    private readonly logger: Logger,
  ) {}

  public async extract(
    request: GenericExtractionRequest,
  ): Promise<GenericExtractionResult> {
    const counters = {
      pagesFetched: 0,
      requestCount: 0,
      invalidPageCount: 0,
      browserFallbackCount: 0,
      blockedResourceCount: 0,
    };
    const warnings: string[] = [];
    const root = await this.processPage(
      request.source.url,
      request.source,
      request.signal,
      counters,
      warnings,
    );
    if (root.extraction.blockedPageReason !== undefined)
      throw new CollectionError(
        'BLOCK_PAGE_DETECTED',
        `Generic source returned a ${root.extraction.blockedPageReason} page.`,
        { sourceId: request.source.id, retryable: false },
      );
    const jobs: ExtractedJob[] = [...root.extraction.jobs];
    const rootLinks =
      request.source.type === 'generic-job-list' &&
      request.source.maxTraversalDepth > 0
        ? root.extraction.links.slice(0, request.source.maxDiscoveredLinks)
        : [];
    if (root.extraction.links.length > rootLinks.length)
      warnings.push('TRAVERSAL_LIMIT_REACHED');
    const discovered = new Map(rootLinks.map((link) => [link.url, link]));
    const visited = new Set([root.page.finalUrl]);
    let frontier = rootLinks;
    for (
      let depth = 1;
      depth <= request.source.maxTraversalDepth && frontier.length > 0;
      depth += 1
    ) {
      const remainingPages = MAX_TOTAL_PAGES - counters.pagesFetched;
      const current = frontier
        .filter((link) => !visited.has(link.url))
        .slice(0, Math.max(0, remainingPages));
      if (current.length < frontier.length)
        warnings.push('TRAVERSAL_LIMIT_REACHED');
      current.forEach((link) => visited.add(link.url));
      const detailResults = await boundedMap(
        current,
        DETAIL_CONCURRENCY,
        request.signal,
        async (link) => {
          try {
            return await this.processPage(
              link.url,
              request.source,
              request.signal,
              counters,
              warnings,
            );
          } catch (error: unknown) {
            counters.invalidPageCount += 1;
            warnings.push('PAGE_EXTRACTION_FAILED');
            this.logger.warn('Generic detail page extraction failed.', {
              sourceId: request.source.id,
              pageUrlSafe: safePageUrl(link.url),
              errorCode:
                error instanceof CollectionError
                  ? error.code
                  : 'EXTRACTION_FAILED',
            });
            return undefined;
          }
        },
      );
      const next: DiscoveredLink[] = [];
      for (const result of detailResults) {
        if (result === undefined) continue;
        jobs.push(...result.extraction.jobs);
        if (depth >= request.source.maxTraversalDepth) continue;
        for (const link of result.extraction.links) {
          if (discovered.has(link.url) || visited.has(link.url)) continue;
          if (discovered.size >= request.source.maxDiscoveredLinks) {
            warnings.push('TRAVERSAL_LIMIT_REACHED');
            break;
          }
          discovered.set(link.url, link);
          next.push(link);
        }
      }
      frontier = next;
    }
    const unique = new Map<string, ExtractedJob>();
    for (const job of jobs)
      if (!unique.has(job.canonicalUrl)) unique.set(job.canonicalUrl, job);
    return {
      jobs: [...unique.values()],
      ...counters,
      linksDiscovered: discovered.size,
      warnings,
    };
  }

  private async processPage(
    url: string,
    source: GenericWebCollectableSource,
    signal: AbortSignal,
    counters: {
      pagesFetched: number;
      requestCount: number;
      invalidPageCount: number;
      browserFallbackCount: number;
      blockedResourceCount: number;
    },
    warnings: string[],
  ): Promise<{
    readonly page: HtmlPage;
    readonly extraction: PageExtractionResult;
  }> {
    if (signal.aborted)
      throw new CollectionError(
        'COLLECTION_ABORTED',
        'Collection was cancelled.',
        { sourceId: source.id, retryable: false },
      );
    const page = await this.acquirer.acquire(
      toHttpRequest(url, source, signal),
    );
    counters.pagesFetched += 1;
    counters.requestCount += page.requestCount;
    let extraction = this.extractor.extract(
      page.html,
      page.finalUrl,
      source.company,
      source.maxDiscoveredLinks,
    );
    warnings.push(...extraction.warnings);
    for (const detection of extraction.atsDetections)
      warnings.push(`KNOWN_ATS_DETECTED:${detection.provider}`);
    if (
      extraction.jobs.length === 0 &&
      extraction.blockedPageReason === undefined &&
      extraction.browserFallbackReason !== undefined &&
      source.allowBrowserFallback &&
      counters.browserFallbackCount < MAX_BROWSER_FALLBACKS
    ) {
      try {
        counters.browserFallbackCount += 1;
        const rendered = await this.browser.render({
          url: page.finalUrl,
          timeoutMs: source.browserTimeoutMs,
          maximumHtmlBytes: MAX_RENDERED_HTML_BYTES,
          allowTestLoopback: source.allowTestLoopback ?? false,
          signal,
        });
        counters.blockedResourceCount += rendered.blockedResourceCount;
        extraction = this.extractor.extract(
          rendered.html,
          rendered.finalUrl,
          source.company,
          source.maxDiscoveredLinks,
        );
        warnings.push(...extraction.warnings);
      } catch (error: unknown) {
        counters.invalidPageCount += 1;
        warnings.push('BROWSER_FALLBACK_FAILED');
        this.logger.warn('Browser fallback failed.', {
          sourceId: source.id,
          pageUrlSafe: safePageUrl(page.finalUrl),
          browserFallbackReason: extraction.browserFallbackReason,
          errorCode:
            error instanceof CollectionError
              ? error.code
              : 'BROWSER_RENDER_FAILED',
        });
      }
    }
    return { page, extraction };
  }
}

function toHttpRequest(
  url: string,
  source: GenericWebCollectableSource,
  signal: AbortSignal,
): HttpRequest {
  return {
    url,
    timeoutMs: source.requestTimeoutMs,
    signal,
    rateLimitKey: new URL(url).hostname,
    minimumIntervalMs: 1_000 / source.requestsPerSecond,
    maximumResponseBytes: MAX_STATIC_HTML_BYTES,
    maximumRedirects: 5,
    ...(source.allowTestLoopback === undefined
      ? {}
      : { allowTestLoopback: source.allowTestLoopback }),
  };
}

async function boundedMap<T, R>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  operation: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R | undefined>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const index = next;
      if (index >= items.length) return;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await operation(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results.filter((item): item is R => item !== undefined);
}

function safePageUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
