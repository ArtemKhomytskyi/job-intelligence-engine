import type { SourceType } from './categories.js';

interface SourceConfigBase {
  readonly id: string;
  readonly type: SourceType;
  readonly enabled: boolean;
  readonly displayName: string;
  readonly tags: readonly string[];
  readonly trackIds: readonly string[];
  readonly trackPolicy?: SourceTrackPolicy;
  readonly company?: string;
  readonly requestTimeoutMs?: number;
  readonly requestsPerSecond?: number;
}

export type SourceTrackPolicy = 'strict' | 'preferred' | 'unrestricted';

export interface GreenhouseSourceConfig extends SourceConfigBase {
  readonly type: 'greenhouse';
  readonly settings: {
    readonly boardToken: string;
    readonly boardUrl?: string;
  };
}

export interface LeverSourceConfig extends SourceConfigBase {
  readonly type: 'lever';
  readonly settings: {
    readonly companySlug: string;
    readonly jobsUrl?: string;
  };
}

export type AdditionalAtsSourceType =
  | 'ashby'
  | 'smartrecruiters'
  | 'workable'
  | 'bamboohr'
  | 'recruitee'
  | 'teamtailor'
  | 'personio'
  | 'jobvite';

export interface AdditionalAtsSourceConfig extends SourceConfigBase {
  readonly type: AdditionalAtsSourceType;
  readonly settings: {
    readonly identifier: string;
    readonly url?: string;
  };
}

export interface GenericJsonLdSourceConfig extends SourceConfigBase {
  readonly type: 'generic-jsonld';
  readonly settings: {
    readonly url: string;
  };
}

export interface GenericPageSourceConfig extends SourceConfigBase {
  readonly type: 'generic-page';
  readonly settings: GenericWebSettings;
}

export interface GenericJobListSourceConfig extends SourceConfigBase {
  readonly type: 'generic-job-list';
  readonly settings: GenericWebSettings;
}

export interface GenericWebSettings {
  readonly url: string;
  readonly browserTimeoutMs?: number;
  readonly maxDiscoveredLinks?: number;
  readonly maxTraversalDepth?: number;
  readonly allowBrowserFallback?: boolean;
}

export type SourceConfig =
  | GreenhouseSourceConfig
  | LeverSourceConfig
  | AdditionalAtsSourceConfig
  | GenericJsonLdSourceConfig
  | GenericPageSourceConfig
  | GenericJobListSourceConfig;
