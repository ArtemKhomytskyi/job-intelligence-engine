import { load, type CheerioAPI } from 'cheerio';

import type {
  AtsDetection,
  DiscoveredLink,
  ExtractedJob,
  FieldEvidence,
  HtmlDocumentExtractor,
  PageExtractionResult,
} from '../../application/index.js';
import type { JsonValue } from '../../domain/index.js';

const MAX_JSON_LD_BLOCKS = 20;
const MAX_JSON_LD_BYTES = 512 * 1024;
const MAX_DESCRIPTION_CHARS = 50_000;
const JOB_PATH =
  /\/(?:job|jobs|career|careers|position|positions|opening|openings|vacanc(?:y|ies)|role|roles)(?:\/|$)/iu;
const EXCLUDED_LINK =
  /(?:privacy|cookie|login|sign-in|search|filter|category|location|department|page=|mailto:|tel:|javascript:)/iu;

export class CheerioDocumentExtractor implements HtmlDocumentExtractor {
  public extract(
    html: string,
    finalUrl: string,
    configuredCompany: string,
    maximumLinks: number,
  ): PageExtractionResult {
    const document = load(html);
    const blockedPageReason = detectBlockedPage(document);
    if (blockedPageReason !== undefined)
      return {
        jobs: [],
        links: [],
        warnings: [`Blocked page detected: ${blockedPageReason}.`],
        atsDetections: [],
        blockedPageReason,
      };

    const warnings: string[] = [];
    const htmlCanonical = resolveCandidateUrl(
      document('link[rel~="canonical" i]').first().attr('href'),
      finalUrl,
      false,
    );
    const objects = discoverJobPostingObjects(document, warnings);
    const links = discoverLinks(document, finalUrl, maximumLinks);
    const jobs = objects.flatMap((object): readonly ExtractedJob[] => {
      const decoded = decodeJobPosting(
        object,
        finalUrl,
        htmlCanonical,
        configuredCompany,
      );
      if (decoded === undefined)
        warnings.push(
          'A malformed or incomplete JobPosting object was skipped.',
        );
      return decoded === undefined ? [] : [decoded];
    });
    const semantic =
      jobs.length === 0 && links.length === 0
        ? extractSemanticJob(
            document,
            finalUrl,
            htmlCanonical,
            configuredCompany,
          )
        : undefined;
    if (semantic !== undefined) jobs.push(semantic);
    const atsDetections = detectAts([
      finalUrl,
      htmlCanonical,
      ...jobs.flatMap((job) => [job.canonicalUrl, job.applicationUrl]),
      ...links.map((link) => link.url),
    ]);
    const browserFallbackReason =
      jobs.length === 0 ? browserReason(document, links.length) : undefined;
    return {
      jobs,
      links,
      warnings,
      atsDetections,
      ...(browserFallbackReason === undefined ? {} : { browserFallbackReason }),
    };
  }
}

function discoverJobPostingObjects(
  document: CheerioAPI,
  warnings: string[],
): readonly Record<string, unknown>[] {
  const jobs: Record<string, unknown>[] = [];
  const blocks = document('script').filter(
    (_index, element) =>
      (document(element).attr('type') ?? '')
        .trim()
        .toLocaleLowerCase('en-US') === 'application/ld+json',
  );
  blocks.slice(0, MAX_JSON_LD_BLOCKS).each((_index, element) => {
    const content = document(element).text().trim();
    if (content.length === 0) return;
    if (new TextEncoder().encode(content).byteLength > MAX_JSON_LD_BYTES) {
      warnings.push('An oversized JSON-LD block was skipped.');
      return undefined;
    }
    try {
      collectJobObjects(JSON.parse(content) as unknown, jobs);
    } catch {
      warnings.push('A malformed JSON-LD block was skipped.');
    }
  });
  if (blocks.length > MAX_JSON_LD_BLOCKS)
    warnings.push('The JSON-LD block limit was reached.');
  return jobs;
}

function collectJobObjects(
  value: unknown,
  jobs: Record<string, unknown>[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJobObjects(item, jobs);
    return;
  }
  if (!isRecord(value)) return;
  if (isJobPostingType(value['@type'])) jobs.push(value);
  const graph = value['@graph'];
  if (Array.isArray(graph))
    for (const item of graph) collectJobObjects(item, jobs);
}

function isJobPostingType(value: unknown): boolean {
  return (
    value === 'JobPosting' ||
    (Array.isArray(value) && value.includes('JobPosting'))
  );
}

function decodeJobPosting(
  object: Record<string, unknown>,
  pageUrl: string,
  htmlCanonical: string | undefined,
  configuredCompany: string,
): ExtractedJob | undefined {
  const title = stringValue(object['title']);
  const company =
    organizationName(object['hiringOrganization']) ?? configuredCompany.trim();
  const description = stringValue(object['description']);
  const applicationUrl = resolveCandidateUrl(
    stringValue(object['applicationUrl']),
    pageUrl,
    true,
  );
  const schemaUrl = resolveCandidateUrl(
    stringValue(object['url']),
    pageUrl,
    true,
  );
  const entityUrl = resolveCandidateUrl(
    mainEntityUrl(object['mainEntityOfPage']),
    pageUrl,
    true,
  );
  const canonicalUrl = schemaUrl ?? entityUrl ?? htmlCanonical ?? pageUrl;
  if (
    title === undefined ||
    company.length === 0 ||
    (description === undefined && applicationUrl === undefined) ||
    resolveCandidateUrl(canonicalUrl, pageUrl, true) === undefined
  )
    return undefined;
  const evidence: FieldEvidence[] = [
    { field: 'title', source: 'json-ld.title', confidence: 1 },
    {
      field: 'company',
      source:
        organizationName(object['hiringOrganization']) === undefined
          ? 'configured-company'
          : 'json-ld.hiringOrganization',
      confidence: 0.95,
    },
    {
      field: 'canonicalUrl',
      source:
        schemaUrl === undefined
          ? entityUrl === undefined
            ? htmlCanonical === undefined
              ? 'final-url'
              : 'html-canonical'
            : 'json-ld.mainEntityOfPage'
          : 'json-ld.url',
      confidence: 0.95,
    },
  ];
  const identifier = identifierValue(object['identifier']);
  const employmentType = firstString(object['employmentType']);
  const locationText =
    locationValue(object['jobLocation']) ??
    locationValue(object['applicantLocationRequirements']);
  const workplaceType = stringValue(object['jobLocationType']);
  const metadata: Record<string, JsonValue> = {
    extractionStrategy: 'json-ld',
    confidence: 0.95,
    evidence: evidence.map((item) => ({ ...item })),
    ...(object['directApply'] === undefined
      ? {}
      : { directApply: object['directApply'] === true }),
    ...(stringValue(object['industry']) === undefined
      ? {}
      : { industry: stringValue(object['industry']) ?? '' }),
    ...(stringValue(object['occupationalCategory']) === undefined
      ? {}
      : {
          occupationalCategory:
            stringValue(object['occupationalCategory']) ?? '',
        }),
    ...(safeJson(object['baseSalary']) === undefined
      ? {}
      : { baseSalary: safeJson(object['baseSalary']) ?? null }),
  };
  return {
    title,
    company,
    canonicalUrl,
    strategy: 'json-ld',
    confidence: 0.95,
    evidence,
    metadata,
    ...(applicationUrl === undefined ? {} : { applicationUrl }),
    ...(description === undefined ? {} : { description }),
    ...(locationText === undefined ? {} : { locationText }),
    ...(employmentType === undefined ? {} : { employmentType }),
    ...(workplaceType === undefined ? {} : { workplaceType }),
    ...(validDate(object['datePosted']) === undefined
      ? {}
      : { publishedAt: validDate(object['datePosted']) ?? '' }),
    ...(validDate(object['validThrough']) === undefined
      ? {}
      : { expiresAt: validDate(object['validThrough']) ?? '' }),
    ...(identifier === undefined ? {} : { externalId: identifier }),
  };
}

function extractSemanticJob(
  document: CheerioAPI,
  pageUrl: string,
  htmlCanonical: string | undefined,
  configuredCompany: string,
): ExtractedJob | undefined {
  const title = cleanText(
    document('[itemprop="title"], main h1, article h1, h1').first().text(),
  );
  const companyFromPage = cleanText(
    document('[itemprop="hiringOrganization"], meta[property="og:site_name"]')
      .first()
      .attr('content') ??
      document('[itemprop="hiringOrganization"]').first().text(),
  );
  const company = companyFromPage ?? cleanText(configuredCompany);
  const descriptionElement = document(
    '[itemprop="description"], [class*="job-description" i], [id*="job-description" i], article, main',
  ).first();
  const description = cleanupSelectedHtml(
    document,
    descriptionElement.html() ?? '',
  );
  const applicationUrl = explicitApplicationUrl(document, pageUrl);
  if (
    title === undefined ||
    company === undefined ||
    (description === undefined && applicationUrl === undefined)
  )
    return undefined;
  const confidence = Math.min(
    1,
    0.4 +
      (description === undefined ? 0 : 0.25) +
      (companyFromPage === undefined ? 0.1 : 0.2) +
      (applicationUrl === undefined ? 0 : 0.15),
  );
  if (confidence < 0.65) return undefined;
  const evidence: FieldEvidence[] = [
    { field: 'title', source: 'semantic-heading', confidence: 0.8 },
    {
      field: 'company',
      source:
        companyFromPage === undefined
          ? 'configured-company'
          : 'semantic-organization',
      confidence: companyFromPage === undefined ? 0.7 : 0.8,
    },
    ...(description === undefined
      ? []
      : [
          {
            field: 'description',
            source: 'semantic-content-container',
            confidence: 0.7,
          },
        ]),
  ];
  const locationText =
    labeledValue(document, 'location') ??
    cleanText(document('[itemprop="jobLocation"], address').first().text());
  const employmentType =
    labeledValue(document, 'employment type') ??
    cleanText(document('[itemprop="employmentType"]').first().text());
  const publishedAt = validDate(
    document('[itemprop="datePosted"], time[datetime]')
      .first()
      .attr('datetime'),
  );
  const canonicalUrl = htmlCanonical ?? pageUrl;
  return {
    title,
    company,
    canonicalUrl,
    strategy: 'semantic-html',
    confidence,
    evidence,
    metadata: {
      extractionStrategy: 'semantic-html',
      confidence,
      evidence: evidence.map((item) => ({ ...item })),
    },
    ...(applicationUrl === undefined ? {} : { applicationUrl }),
    ...(description === undefined ? {} : { description }),
    ...(locationText === undefined ? {} : { locationText }),
    ...(employmentType === undefined ? {} : { employmentType }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  };
}

function cleanupSelectedHtml(
  _document: CheerioAPI,
  html: string,
): string | undefined {
  if (html.length === 0) return undefined;
  const fragment = load(`<main>${html}</main>`);
  fragment(
    'script,style,noscript,svg,canvas,iframe,template,nav,footer,[hidden],[aria-hidden="true"],.cookie-banner,[class*="cookie" i]',
  ).remove();
  fragment('br,p,li,h1,h2,h3,h4,h5,h6,tr,dt,dd').append('\n');
  const value = fragment('main')
    .text()
    .replace(/\r/gu, '')
    .split('\n')
    .map(cleanText)
    .filter((line): line is string => line !== undefined)
    .join('\n');
  return value.length === 0 ? undefined : value.slice(0, MAX_DESCRIPTION_CHARS);
}

function discoverLinks(
  document: CheerioAPI,
  pageUrl: string,
  maximum: number,
): readonly DiscoveredLink[] {
  const selected = new Map<string, DiscoveredLink>();
  document(
    'main a[href], article a[href], [class*="job" i] a[href], a[itemprop="url"][href]',
  ).each((_index, element) => {
    if (selected.size >= maximum) return false;
    const href = document(element).attr('href');
    const text = cleanText(document(element).text()) ?? '';
    if (
      href === undefined ||
      EXCLUDED_LINK.test(href) ||
      EXCLUDED_LINK.test(text) ||
      /^(?:apply|apply now|submit application)$/iu.test(text)
    )
      return;
    const resolved = resolveCandidateUrl(href, pageUrl, true);
    if (resolved === undefined || resolved === pageUrl) return undefined;
    if (/\/apply(?:\/|$)/iu.test(new URL(resolved).pathname)) return undefined;
    const sameOrigin = new URL(resolved).origin === new URL(pageUrl).origin;
    const ats = detectAts([resolved]).length > 0;
    if (!sameOrigin && !ats) return undefined;
    if (
      !JOB_PATH.test(new URL(resolved).pathname) &&
      !/apply|engineer|developer|manager|designer|analyst|role|position|opening/iu.test(
        text,
      )
    )
      return undefined;
    selected.set(resolved, {
      url: resolved,
      reason: JOB_PATH.test(new URL(resolved).pathname)
        ? 'job-like-path'
        : 'job-like-anchor-text',
    });
    return undefined;
  });
  return [...selected.values()];
}

export function detectAts(
  values: readonly (string | undefined)[],
): readonly AtsDetection[] {
  const detections = new Map<string, AtsDetection>();
  for (const value of values) {
    if (value === undefined) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    const host = url.hostname.toLocaleLowerCase('en-US');
    const provider =
      host === 'boards.greenhouse.io' ||
      host === 'job-boards.greenhouse.io' ||
      host === 'boards-api.greenhouse.io'
        ? 'greenhouse'
        : host === 'jobs.lever.co' || host === 'api.lever.co'
          ? 'lever'
          : undefined;
    if (provider !== undefined)
      detections.set(provider, {
        provider,
        confidence: 1,
        reason: 'known-ats-host',
        matchedHost: host,
        recommendedHandling: 'dedicated-collector-preferred',
      });
  }
  return [...detections.values()];
}

function detectBlockedPage(
  document: CheerioAPI,
): PageExtractionResult['blockedPageReason'] {
  const text = document('title, h1, main, body')
    .text()
    .toLocaleLowerCase('en-US')
    .slice(0, 20_000);
  if (/captcha|verify you are human|challenge required/u.test(text))
    return 'captcha';
  if (
    /sign in to continue|log in to continue|authentication required/u.test(text)
  )
    return 'login';
  if (/access denied|request blocked|forbidden/u.test(text))
    return 'access-denied';
  return undefined;
}

function browserReason(
  document: CheerioAPI,
  linkCount: number,
): string | undefined {
  const bodyText = cleanText(document('body').text()) ?? '';
  const hasScripts = document('script[src], script[type="module"]').length > 0;
  const hasRoot =
    document('#root, #app, [data-reactroot], [data-v-app]').length > 0;
  if (/javascript (?:is )?required|enable javascript/iu.test(bodyText))
    return 'javascript-required';
  if (linkCount === 0 && hasScripts && (hasRoot || bodyText.length < 300))
    return 'client-rendered-app-shell';
  return undefined;
}

function explicitApplicationUrl(
  document: CheerioAPI,
  pageUrl: string,
): string | undefined {
  let result: string | undefined;
  document('a[href]').each((_index, element) => {
    const text = cleanText(document(element).text()) ?? '';
    if (!/^(?:apply|apply now|submit application)$/iu.test(text)) return;
    result = resolveCandidateUrl(document(element).attr('href'), pageUrl, true);
    return result === undefined;
  });
  return result;
}

function labeledValue(document: CheerioAPI, label: string): string | undefined {
  let result: string | undefined;
  document('dt, th, strong, b').each((_index, element) => {
    if (
      (cleanText(document(element).text()) ?? '')
        .toLocaleLowerCase('en-US')
        .replace(/:$/u, '') !== label
    )
      return;
    result = cleanText(document(element).next().text());
    return result === undefined;
  });
  return result;
}

function resolveCandidateUrl(
  value: string | undefined,
  base: string,
  allowKnownAtsCrossOrigin: boolean,
): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
    )
      return undefined;
    if (url.username || url.password) return undefined;
    const crossOrigin = url.origin !== new URL(base).origin;
    if (
      crossOrigin &&
      !(allowKnownAtsCrossOrigin && detectAts([url.toString()]).length > 0)
    )
      return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function mainEntityUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value)
    ? (stringValue(value['@id']) ?? stringValue(value['url']))
    : undefined;
}

function organizationName(value: unknown): string | undefined {
  return isRecord(value) ? stringValue(value['name']) : stringValue(value);
}

function identifierValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  return isRecord(value)
    ? (stringValue(value['value']) ?? stringValue(value['name']))
    : undefined;
}

function locationValue(value: unknown): string | undefined {
  if (Array.isArray(value))
    return (
      value
        .map(locationValue)
        .filter((item): item is string => item !== undefined)
        .join('; ') || undefined
    );
  if (typeof value === 'string') return cleanText(value);
  if (!isRecord(value)) return undefined;
  const address = isRecord(value['address']) ? value['address'] : value;
  return (
    [
      address['streetAddress'],
      address['addressLocality'],
      address['addressRegion'],
      address['postalCode'],
      address['addressCountry'],
    ]
      .map(stringValue)
      .filter((item): item is string => item !== undefined)
      .join(', ') || stringValue(value['name'])
  );
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value)
    ? value.map(stringValue).find((item) => item !== undefined)
    : stringValue(value);
}

function validDate(value: unknown): string | undefined {
  const text = stringValue(value);
  if (text === undefined) return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? cleanText(String(value))
    : undefined;
}

function cleanText(value: string): string | undefined {
  const cleaned = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return cleaned.length === 0 ? undefined : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) {
    const items = value.map(safeJson);
    if (!items.every((item): item is JsonValue => item !== undefined))
      return undefined;
    return items;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([key, item]) => [key, safeJson(item)] as const,
    );
    return entries.every(([, item]) => item !== undefined)
      ? (Object.fromEntries(entries) as Record<string, JsonValue>)
      : undefined;
  }
  return undefined;
}
