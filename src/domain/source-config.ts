import type { SourceType } from './categories.js';

interface SourceConfigBase {
  readonly id: string;
  readonly type: SourceType;
  readonly enabled: boolean;
  readonly displayName: string;
  readonly tags: readonly string[];
  readonly trackIds: readonly string[];
  readonly company?: string;
  readonly requestTimeoutMs?: number;
  readonly requestsPerSecond?: number;
}

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

export interface GenericJsonLdSourceConfig extends SourceConfigBase {
  readonly type: 'generic-jsonld';
  readonly settings: {
    readonly url: string;
  };
}

export interface GenericPageSourceConfig extends SourceConfigBase {
  readonly type: 'generic-page';
  readonly settings: {
    readonly url: string;
  };
}

export type SourceConfig =
  | GreenhouseSourceConfig
  | LeverSourceConfig
  | GenericJsonLdSourceConfig
  | GenericPageSourceConfig;
