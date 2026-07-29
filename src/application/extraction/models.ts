import type { JsonValue } from '../../domain/index.js';
import type { GenericWebCollectableSource } from '../collection/models.js';

export type ExtractionStrategy = 'json-ld' | 'semantic-html';
export type AtsProvider = 'greenhouse' | 'lever';

export interface FieldEvidence {
  readonly field: string;
  readonly source: string;
  readonly confidence: number;
}

export interface ExtractedJob {
  readonly title: string;
  readonly company: string;
  readonly canonicalUrl: string;
  readonly applicationUrl?: string;
  readonly description?: string;
  readonly locationText?: string;
  readonly employmentType?: string;
  readonly workplaceType?: string;
  readonly publishedAt?: string;
  readonly expiresAt?: string;
  readonly externalId?: string;
  readonly strategy: ExtractionStrategy;
  readonly confidence: number;
  readonly evidence: readonly FieldEvidence[];
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface DiscoveredLink {
  readonly url: string;
  readonly reason: string;
}

export interface AtsDetection {
  readonly provider: AtsProvider;
  readonly confidence: number;
  readonly reason: string;
  readonly matchedHost: string;
  readonly recommendedHandling: 'dedicated-collector-preferred';
}

export interface PageExtractionResult {
  readonly jobs: readonly ExtractedJob[];
  readonly links: readonly DiscoveredLink[];
  readonly warnings: readonly string[];
  readonly atsDetections: readonly AtsDetection[];
  readonly browserFallbackReason?: string;
  readonly blockedPageReason?: 'captcha' | 'login' | 'access-denied';
}

export interface HtmlPage {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly html: string;
  readonly status: number;
  readonly requestCount: number;
  readonly redirectCount: number;
  readonly rendered: boolean;
  readonly blockedResourceCount: number;
}

export interface BrowserRenderRequest {
  readonly url: string;
  readonly timeoutMs: number;
  readonly maximumHtmlBytes: number;
  readonly allowTestLoopback: boolean;
  readonly signal: AbortSignal;
}

export interface BrowserRenderResult {
  readonly finalUrl: string;
  readonly html: string;
  readonly durationMs: number;
  readonly blockedResourceCount: number;
}

export interface GenericExtractionRequest {
  readonly source: GenericWebCollectableSource;
  readonly collectedAt: string;
  readonly signal: AbortSignal;
}

export interface GenericExtractionResult {
  readonly jobs: readonly ExtractedJob[];
  readonly pagesFetched: number;
  readonly requestCount: number;
  readonly invalidPageCount: number;
  readonly linksDiscovered: number;
  readonly browserFallbackCount: number;
  readonly blockedResourceCount: number;
  readonly warnings: readonly string[];
}
