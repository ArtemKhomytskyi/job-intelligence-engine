import {
  ATS_PROVIDERS,
  discoverAtsProvider,
  type AtsProvider,
  type CompanyConfig,
  type ProviderDiscoveryResult,
} from '../../domain/index.js';
import type { CompanyRegistryPort } from './company-registry.js';
import { CollectionError } from './errors.js';
import type {
  AdditionalAtsCollectableSource,
  CollectableSource,
  CollectionContext,
} from './models.js';
import type { HttpClient } from './ports.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUESTS_PER_SECOND,
} from './source-mapper.js';

export class CompanyDiscoveryService {
  public constructor(
    private readonly http: HttpClient,
    private readonly registry?: Pick<CompanyRegistryPort, 'getCompany'>,
  ) {}

  public async discover(
    company: CompanyConfig,
    context: CollectionContext,
  ): Promise<ProviderDiscoveryResult> {
    const override = discoverAtsProvider({ company });
    if (override.status === 'DISCOVERED') return override;
    const cached = await this.registry?.getCompany(company.id);
    if (
      cached !== undefined &&
      cached.discoveryStatus === 'DISCOVERED' &&
      isDiscoveredProvider(cached.provider) &&
      (company.careersUrl === undefined ||
        cached.careersUrl === company.careersUrl)
    )
      return {
        status: 'DISCOVERED',
        companyId: company.id,
        companyName: company.name,
        ...(cached.careersUrl === undefined
          ? {}
          : { careersUrl: cached.careersUrl }),
        provider: cached.provider,
        confidence: cached.discoveryConfidence,
        method: isDiscoveryMethod(cached.discoveryMethod)
          ? cached.discoveryMethod
          : 'URL_PATTERN',
        evidence: [],
        diagnostics: ['Reused persisted provider discovery.'],
      };
    const candidates = discoveryUrls(company);
    if (candidates.length === 0)
      return {
        ...override,
        diagnostics: [
          'A careersUrl, websiteUrl, or sourceOverride is required for network discovery.',
        ],
      };
    const diagnostics: string[] = [];
    for (const requestedUrl of candidates) {
      try {
        const response = await this.http.getText({
          url: requestedUrl,
          timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
          signal: context.signal,
          rateLimitKey: new URL(requestedUrl).hostname,
          minimumIntervalMs: 1_000 / DEFAULT_REQUESTS_PER_SECOND,
          maximumResponseBytes: 2_000_000,
          maximumRedirects: 5,
        });
        const result = discoverAtsProvider({
          company,
          requestedUrl,
          finalUrl: response.finalUrl,
          html: response.data,
        });
        if (result.status === 'DISCOVERED') return result;
        diagnostics.push(...result.diagnostics);
      } catch {
        diagnostics.push(
          `Discovery request failed for ${safeHost(requestedUrl)}.`,
        );
      }
    }
    return {
      status: 'UNKNOWN_PROVIDER',
      companyId: company.id,
      companyName: company.name,
      ...(company.careersUrl === undefined
        ? {}
        : { careersUrl: company.careersUrl }),
      confidence: 0,
      method: 'UNKNOWN',
      evidence: [],
      diagnostics: [...new Set(diagnostics)].sort((left, right) =>
        left.localeCompare(right, 'en-US'),
      ),
    };
  }
}

export interface CompanySourceResolution {
  readonly sources: readonly CollectableSource[];
  readonly discoveries: readonly ProviderDiscoveryResult[];
}

export async function resolveCompanySources(
  service: CompanyDiscoveryService,
  companies: readonly CompanyConfig[],
  context: CollectionContext,
): Promise<CompanySourceResolution> {
  const enabled = companies.filter((company) => company.enabled);
  const discoveries = await Promise.all(
    enabled.map((company) => service.discover(company, context)),
  );
  const sources = discoveries.flatMap((result, index) => {
    const company = enabled[index];
    if (company === undefined || result.status !== 'DISCOVERED') return [];
    try {
      return [discoveredSource(company, result)];
    } catch {
      return [];
    }
  });
  return { sources, discoveries };
}

export function discoveredSource(
  company: CompanyConfig,
  result: ProviderDiscoveryResult,
): CollectableSource {
  if (result.status !== 'DISCOVERED' || result.provider === undefined)
    throw new CollectionError(
      'SOURCE_CONFIGURATION_INVALID',
      `Company "${company.id}" has no collectable discovered provider.`,
      { sourceId: company.id, retryable: false },
    );
  const common = {
    id: `company-${company.id}`,
    displayName: company.name,
    enabled: company.enabled,
    company: company.name,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
  };
  if (
    result.provider === 'generic-page' ||
    result.provider === 'generic-job-list'
  ) {
    const url = company.sourceOverride?.url ?? result.careersUrl;
    if (url === undefined)
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        `Company "${company.id}" generic override requires a URL.`,
        { sourceId: company.id, retryable: false },
      );
    return {
      ...common,
      type: result.provider,
      url,
      browserTimeoutMs: 30_000,
      maxDiscoveredLinks: 200,
      maxTraversalDepth: result.provider === 'generic-page' ? 0 : 1,
      allowBrowserFallback: false,
    };
  }
  const identifier =
    company.sourceOverride?.identifier ??
    (result.careersUrl === undefined
      ? undefined
      : providerIdentifier(result.provider, result.careersUrl));
  if (identifier === undefined)
    throw new CollectionError(
      'SOURCE_CONFIGURATION_INVALID',
      `The discovered ${result.provider} URL does not contain a usable public identifier.`,
      { sourceId: company.id, retryable: false },
    );
  if (result.provider === 'greenhouse')
    return { ...common, type: 'greenhouse', boardToken: identifier };
  if (result.provider === 'lever')
    return { ...common, type: 'lever', companySlug: identifier };
  const careersUrl =
    result.careersUrl ?? canonicalProviderUrl(result.provider, identifier);
  return {
    ...common,
    type: result.provider,
    identifier,
    url: providerApiOverride(result.provider, identifier, careersUrl),
  } as AdditionalAtsCollectableSource;
}

function canonicalProviderUrl(
  provider: AtsProvider,
  identifier: string,
): string {
  switch (provider) {
    case 'greenhouse':
      return `https://boards.greenhouse.io/${identifier}`;
    case 'lever':
      return `https://jobs.lever.co/${identifier}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${identifier}`;
    case 'smartrecruiters':
      return `https://jobs.smartrecruiters.com/${identifier}`;
    case 'workable':
      return `https://apply.workable.com/${identifier}`;
    case 'bamboohr':
      return `https://${identifier}.bamboohr.com/careers`;
    case 'recruitee':
      return `https://${identifier}.recruitee.com`;
    case 'teamtailor':
      return `https://${identifier}.teamtailor.com/jobs`;
    case 'personio':
      return `https://${identifier}.jobs.personio.com`;
    case 'jobvite':
      return `https://jobs.jobvite.com/${identifier}`;
  }
}

function discoveryUrls(company: CompanyConfig): readonly string[] {
  if (company.careersUrl !== undefined) return [company.careersUrl];
  if (company.websiteUrl === undefined) return [];
  const base = new URL(company.websiteUrl);
  return ['/careers', '/jobs'].map((path) => new URL(path, base).toString());
}

function providerIdentifier(
  provider: AtsProvider,
  careersUrl: string,
): string | undefined {
  const url = new URL(careersUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const subdomain = url.hostname.split('.')[0];
  switch (provider) {
    case 'greenhouse':
    case 'lever':
    case 'ashby':
    case 'smartrecruiters':
    case 'workable':
    case 'jobvite':
      return parts[0];
    case 'bamboohr':
    case 'recruitee':
    case 'teamtailor':
    case 'personio':
      return subdomain;
  }
}

function providerApiOverride(
  provider: Exclude<AtsProvider, 'greenhouse' | 'lever'>,
  _identifier: string,
  careersUrl: string,
): string | undefined {
  return ['workable', 'bamboohr', 'teamtailor', 'personio', 'jobvite'].includes(
    provider,
  )
    ? careersUrl
    : undefined;
}

function safeHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'invalid URL';
  }
}

function isDiscoveredProvider(
  value: string | undefined,
): value is
  (typeof ATS_PROVIDERS)[number] | 'generic-page' | 'generic-job-list' {
  return (
    value === 'generic-page' ||
    value === 'generic-job-list' ||
    ATS_PROVIDERS.some((provider) => provider === value)
  );
}

function isDiscoveryMethod(
  value: string | undefined,
): value is ProviderDiscoveryResult['method'] {
  return [
    'SOURCE_OVERRIDE',
    'URL_PATTERN',
    'HTML_FINGERPRINT',
    'REDIRECT_URL',
    'UNKNOWN',
  ].some((method) => method === value);
}
