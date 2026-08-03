export const CONFIG_ERROR_CODES = [
  'CONFIG_FILE_NOT_FOUND',
  'CONFIG_FILE_UNREADABLE',
  'CONFIG_YAML_INVALID',
  'CONFIG_SCHEMA_INVALID',
  'CONFIG_REFERENCE_INVALID',
  'CONFIG_DUPLICATE_ID',
  'CONFIG_WEIGHT_TOTAL_INVALID',
  'CONFIG_RANGE_INVALID',
  'PLACEHOLDER_SOURCE_NOT_ALLOWED',
  'BROWSER_FALLBACK_EXTERNAL_UNSAFE',
  'CONFIG_INTERNAL_ERROR',
] as const;

export type ConfigurationErrorCode = (typeof CONFIG_ERROR_CODES)[number];
export type ConfigurationSection = 'profile' | 'search' | 'scoring' | 'sources';

export interface ConfigurationIssue {
  readonly code: ConfigurationErrorCode;
  readonly section: ConfigurationSection;
  readonly message: string;
  readonly filePath?: string;
  readonly fieldPath?: string;
}

export class ConfigurationError extends Error {
  public readonly issues: readonly ConfigurationIssue[];

  public constructor(
    issues: readonly ConfigurationIssue[],
    options?: { readonly cause?: unknown },
  ) {
    super(
      issues.length === 1
        ? issues[0]?.message
        : `Configuration contains ${issues.length} issues.`,
      options,
    );
    this.name = 'ConfigurationError';
    this.issues = Object.freeze([...issues]);
  }
}
