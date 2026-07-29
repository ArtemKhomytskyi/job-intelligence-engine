import type { SearchTrack, SourceConfig } from '../../domain/index.js';
import { SCORING_COMPONENT_KEYS } from '../../domain/index.js';
import type { ConfigurationBundle } from './configuration-bundle.js';
import {
  ConfigurationError,
  type ConfigurationIssue,
  type ConfigurationSection,
} from './errors.js';

const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function validateConfiguration(bundle: ConfigurationBundle): void {
  const issues: ConfigurationIssue[] = [];

  validateSafeId(bundle.candidate.id, 'profile', 'candidate.id', issues);
  validateTracks(bundle, issues);
  validateSources(bundle, issues);
  validateWeights(bundle, issues);
  validatePreferences(bundle, issues);

  if (issues.length > 0) {
    throw new ConfigurationError(issues);
  }
}

function validateTracks(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  collectDuplicateIds(bundle.search.tracks, 'search', 'tracks', issues);

  for (const [index, track] of bundle.search.tracks.entries()) {
    validateSafeId(track.id, 'search', `tracks[${index}].id`, issues);
  }

  const enabledTracks = bundle.search.tracks.filter((track) => track.enabled);
  if (enabledTracks.length === 0) {
    issues.push({
      code: 'CONFIG_REFERENCE_INVALID',
      section: 'search',
      fieldPath: 'tracks',
      message: 'At least one search track must be enabled.',
    });
  }

  const quotaTotal = enabledTracks.reduce(
    (total, track) => total + (track.recommendationQuota ?? 0),
    0,
  );
  if (quotaTotal > bundle.search.preferences.dailyRecommendationLimit) {
    issues.push({
      code: 'CONFIG_RANGE_INVALID',
      section: 'search',
      fieldPath: 'tracks.recommendationQuota',
      message: `Enabled track quotas total ${quotaTotal}, which exceeds the daily recommendation limit of ${bundle.search.preferences.dailyRecommendationLimit}.`,
    });
  }
}

function validateSources(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  collectDuplicateIds(bundle.sources, 'sources', 'sources', issues);

  const trackIds = new Set(bundle.search.tracks.map((track) => track.id));
  for (const [index, source] of bundle.sources.entries()) {
    validateSafeId(source.id, 'sources', `sources[${index}].id`, issues);
    for (const [trackIndex, trackId] of source.trackIds.entries()) {
      if (!trackIds.has(trackId)) {
        issues.push({
          code: 'CONFIG_REFERENCE_INVALID',
          section: 'sources',
          fieldPath: `sources[${index}].trackIds[${trackIndex}]`,
          message: `Source "${source.id}" references unknown track "${trackId}".`,
        });
      }
    }
  }

  if (!bundle.sources.some((source) => source.enabled)) {
    issues.push({
      code: 'CONFIG_REFERENCE_INVALID',
      section: 'sources',
      fieldPath: 'sources',
      message: 'At least one source must be enabled.',
    });
  }
}

function validateWeights(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  const total = SCORING_COMPONENT_KEYS.reduce(
    (sum, key) => sum + bundle.scoring.weights[key],
    0,
  );

  if (Math.abs(total - 100) > 1e-9) {
    issues.push({
      code: 'CONFIG_WEIGHT_TOTAL_INVALID',
      section: 'scoring',
      fieldPath: 'weights',
      message: `Scoring weights must total 100; received ${total}.`,
    });
  }
}

function validatePreferences(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  const preferences = bundle.search.preferences;
  if (
    !preferences.willingToRelocate &&
    preferences.relocationCountries.length > 0
  ) {
    issues.push({
      code: 'CONFIG_REFERENCE_INVALID',
      section: 'search',
      fieldPath: 'preferences.relocationCountries',
      message: 'Relocation countries require willingToRelocate to be true.',
    });
  }

  if (
    preferences.maximumRecommendationsPerCompany >
    preferences.dailyRecommendationLimit
  ) {
    issues.push({
      code: 'CONFIG_RANGE_INVALID',
      section: 'search',
      fieldPath: 'preferences.maximumRecommendationsPerCompany',
      message:
        'Maximum recommendations per company cannot exceed the daily limit.',
    });
  }
}

function collectDuplicateIds(
  values: readonly (SearchTrack | SourceConfig)[],
  section: ConfigurationSection,
  collectionPath: string,
  issues: ConfigurationIssue[],
): void {
  const firstIndexes = new Map<string, number>();
  for (const [index, value] of values.entries()) {
    const firstIndex = firstIndexes.get(value.id);
    if (firstIndex === undefined) {
      firstIndexes.set(value.id, index);
      continue;
    }

    issues.push({
      code: 'CONFIG_DUPLICATE_ID',
      section,
      fieldPath: `${collectionPath}[${index}].id`,
      message: `ID "${value.id}" duplicates ${collectionPath}[${firstIndex}].id.`,
    });
  }
}

function validateSafeId(
  value: string,
  section: ConfigurationSection,
  fieldPath: string,
  issues: ConfigurationIssue[],
): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    issues.push({
      code: 'CONFIG_SCHEMA_INVALID',
      section,
      fieldPath,
      message: `ID "${value}" must use lowercase letters, numbers, and single hyphens.`,
    });
  }
}
