import type { SourceConfig } from '../../domain/index.js';
import { CollectionError } from './errors.js';
import type { CollectableSource, CollectorSourceType } from './models.js';

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_REQUESTS_PER_SECOND = 2;
export const DEFAULT_BROWSER_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_DISCOVERED_LINKS = 50;

export interface SourceSelection {
  readonly sourceIds?: ReadonlySet<string>;
  readonly sourceType?: CollectorSourceType;
}

export function toCollectableSources(
  sources: readonly SourceConfig[],
  selection: SourceSelection = {},
): readonly CollectableSource[] {
  const configuredIds = new Set(sources.map((source) => source.id));
  for (const selectedId of selection.sourceIds ?? []) {
    if (!configuredIds.has(selectedId)) {
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        `Selected source "${selectedId}" does not exist.`,
      );
    }
  }

  const selected = sources.filter(
    (source) =>
      source.enabled &&
      (selection.sourceIds === undefined ||
        selection.sourceIds.has(source.id)) &&
      (selection.sourceType === undefined ||
        source.type === selection.sourceType),
  );
  const collectable = selected.flatMap(
    (source): readonly CollectableSource[] => {
      const common = {
        id: source.id,
        displayName: source.displayName,
        enabled: source.enabled,
        company: source.company ?? source.displayName,
        requestTimeoutMs: source.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        requestsPerSecond:
          source.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND,
      };
      switch (source.type) {
        case 'greenhouse':
          return [
            {
              ...common,
              type: source.type,
              boardToken: source.settings.boardToken,
            },
          ];
        case 'lever':
          return [
            {
              ...common,
              type: source.type,
              companySlug: source.settings.companySlug,
            },
          ];
        case 'generic-jsonld':
          return [];
        case 'generic-page':
        case 'generic-job-list':
          return [
            {
              ...common,
              type: source.type,
              url: source.settings.url,
              browserTimeoutMs:
                source.settings.browserTimeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS,
              maxDiscoveredLinks:
                source.settings.maxDiscoveredLinks ??
                DEFAULT_MAX_DISCOVERED_LINKS,
              maxTraversalDepth:
                source.settings.maxTraversalDepth ??
                (source.type === 'generic-job-list' ? 1 : 0),
              allowBrowserFallback:
                source.settings.allowBrowserFallback ?? true,
            },
          ];
      }
    },
  );

  if (collectable.length === 0) {
    throw new CollectionError(
      'SOURCE_CONFIGURATION_INVALID',
      'No enabled supported sources match the collection selection.',
    );
  }
  return collectable;
}
