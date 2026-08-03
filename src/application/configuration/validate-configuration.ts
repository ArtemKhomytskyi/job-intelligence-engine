import type { SearchTrack, SourceConfig } from '../../domain/index.js';
import {
  WEIGHTED_SCORING_COMPONENT_KEYS,
  inspectSourceReadiness,
} from '../../domain/index.js';
import type {
  ConfigurationBundle,
  ConfigurationValidationMode,
} from './configuration-bundle.js';
import {
  ConfigurationError,
  type ConfigurationIssue,
  type ConfigurationSection,
} from './errors.js';

const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface ValidateConfigurationOptions {
  readonly mode?: ConfigurationValidationMode;
}

export function validateConfiguration(
  bundle: ConfigurationBundle,
  options: ValidateConfigurationOptions = {},
): readonly ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const warnings: ConfigurationIssue[] = [];
  const mode = options.mode ?? 'runtime';

  validateSafeId(bundle.candidate.id, 'profile', 'candidate.id', issues);
  validateTracks(bundle, issues);
  validateSources(bundle, mode, issues);
  validateWeights(bundle, issues);
  validateScoringSettings(bundle, issues);
  validatePreferences(bundle, issues);
  validateSemanticConsistency(bundle, issues, warnings);

  if (issues.length > 0) {
    throw new ConfigurationError(issues);
  }
  return warnings;
}

function validateSemanticConsistency(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
  warnings: ConfigurationIssue[],
): void {
  const targetRoles = bundle.candidate.targetRoles;
  if (targetRoles !== undefined) {
    const excluded = new Set(
      targetRoles.excludedTitles.map(normalizedConfigurationValue),
    );
    for (const [field, titles] of [
      ['primaryTitles', targetRoles.primaryTitles],
      ['secondaryTitles', targetRoles.secondaryTitles],
      ['adjacentTitles', targetRoles.adjacentTitles],
      ['exploratoryTitles', targetRoles.exploratoryTitles],
    ] as const)
      for (const [index, title] of titles.entries())
        if (excluded.has(normalizedConfigurationValue(title)))
          issues.push({
            code: 'CONFIG_SEMANTIC_CONFLICT',
            section: 'profile',
            fieldPath: `candidate.targetRoles.${field}[${index}]`,
            relatedFieldPath: 'candidate.targetRoles.excludedTitles',
            conflictingValue: title,
            message: `Title "${title}" is both preferred and excluded. Remove it from one list.`,
          });
    const excludedFamilies = new Set(targetRoles.excludedRoleFamilies);
    for (const [index, family] of targetRoles.roleFamilies.entries())
      if (excludedFamilies.has(family))
        issues.push({
          code: 'CONFIG_SEMANTIC_CONFLICT',
          section: 'profile',
          fieldPath: `candidate.targetRoles.roleFamilies[${index}]`,
          relatedFieldPath: 'candidate.targetRoles.excludedRoleFamilies',
          conflictingValue: family,
          message: `Role family "${family}" is both targeted and excluded. Remove it from one list.`,
        });
  }
  for (const [trackIndex, track] of bundle.search.tracks.entries()) {
    const excluded = new Set(
      (track.excludedSkills ?? []).map(normalizedConfigurationValue),
    );
    for (const [skillIndex, skill] of (track.requiredSkills ?? []).entries())
      if (excluded.has(normalizedConfigurationValue(skill)))
        issues.push({
          code: 'CONFIG_SEMANTIC_CONFLICT',
          section: 'search',
          fieldPath: `tracks[${trackIndex}].requiredSkills[${skillIndex}]`,
          relatedFieldPath: `tracks[${trackIndex}].excludedSkills`,
          conflictingValue: skill,
          message: `Track skill "${skill}" is both required and excluded.`,
        });
    if (
      track.minimumScore !== undefined &&
      track.minimumScore < bundle.search.preferences.minimumAcceptableScore
    )
      warnings.push({
        code: 'CONFIG_SEMANTIC_WARNING',
        severity: 'WARNING',
        section: 'search',
        fieldPath: `tracks[${trackIndex}].minimumScore`,
        relatedFieldPath: 'preferences.minimumAcceptableScore',
        conflictingValue: track.minimumScore,
        message: `Track minimum ${track.minimumScore} is below the global minimum ${bundle.search.preferences.minimumAcceptableScore}; the global minimum remains effective.`,
      });
  }
  const total = bundle.candidate.totalYearsExperience;
  const maximum =
    bundle.search.preferences.hardFilters.maximumRequiredExperienceYears;
  if (
    total !== undefined &&
    maximum < total &&
    bundle.search.preferences.hardFilters
      .maximumRequiredExperienceYearsIntentional !== true
  )
    issues.push({
      code: 'CONFIG_SEMANTIC_CONFLICT',
      section: 'search',
      fieldPath: 'preferences.hardFilters.maximumRequiredExperienceYears',
      relatedFieldPath: 'candidate.totalYearsExperience',
      conflictingValue: maximum,
      message: `Maximum job requirement ${maximum} is below the candidate's ${total} total years. Raise it or set maximumRequiredExperienceYearsIntentional: true with an intentional search-scope rationale.`,
    });
  const maximumTarget = bundle.candidate.maximumTargetSeniority;
  const candidateMaximumIndex =
    maximumTarget === undefined
      ? undefined
      : Math.min(
          seniorityIndex(maximumTarget) +
            (bundle.candidate.allowSeniorityStretch === true ? 1 : 0),
          seniorityIndex('executive'),
        );
  if (
    candidateMaximumIndex !== undefined &&
    seniorityIndex(bundle.search.preferences.hardFilters.maximumSeniority) <
      candidateMaximumIndex
  )
    issues.push({
      code: 'CONFIG_SEMANTIC_CONFLICT',
      section: 'search',
      fieldPath: 'preferences.hardFilters.maximumSeniority',
      relatedFieldPath: 'candidate.maximumTargetSeniority',
      conflictingValue: bundle.search.preferences.hardFilters.maximumSeniority,
      message: `Hard-filter maximum seniority prevents the candidate target${bundle.candidate.allowSeniorityStretch === true ? ' and configured one-level stretch' : ''} above ${maximumTarget}. Align the two fields.`,
    });
  const enabledSources = bundle.sources.filter((source) => source.enabled);
  if (enabledSources.length === 0) return;
  for (const track of bundle.search.tracks.filter((item) => item.enabled)) {
    const available = enabledSources.some(
      (source) =>
        source.trackPolicy !== 'strict' ||
        source.trackIds.length === 0 ||
        source.trackIds.includes(track.id),
    );
    if (!available)
      warnings.push({
        code: 'CONFIG_SEMANTIC_WARNING',
        severity: 'WARNING',
        section: 'sources',
        fieldPath: 'sources.trackIds',
        relatedFieldPath: `search.tracks.${track.id}`,
        conflictingValue: track.id,
        message: `Enabled track "${track.id}" is unavailable to every enabled strict source. Add it to a source, use preferred/unrestricted policy, or disable the track.`,
      });
  }
}

function normalizedConfigurationValue(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

function seniorityIndex(value: import('../../domain/index.js').SeniorityLevel) {
  return [
    'intern',
    'entry',
    'mid',
    'senior',
    'staff',
    'principal',
    'lead',
    'manager',
    'director',
    'vp',
    'executive',
  ].indexOf(value);
}

function validateScoringSettings(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  const settings = bundle.scoring.settings;
  if (settings.freshnessFullScoreDays >= settings.freshnessHorizonDays) {
    issues.push({
      code: 'CONFIG_RANGE_INVALID',
      section: 'scoring',
      fieldPath: 'settings.freshnessHorizonDays',
      message: 'Freshness horizon must exceed the full-score window.',
    });
  }
  for (const [field, aliases] of [
    ['titleAliases', settings.titleAliases],
    ['skillAliases', settings.skillAliases],
  ] as const) {
    const values = new Set<string>();
    for (const [index, alias] of aliases.entries()) {
      for (const value of [alias.canonical, ...alias.aliases]) {
        const normalized = value
          .normalize('NFKC')
          .toLocaleLowerCase('en-US')
          .trim();
        if (values.has(normalized))
          issues.push({
            code: 'CONFIG_DUPLICATE_ID',
            section: 'scoring',
            fieldPath: `settings.${field}[${index}]`,
            message: `Scoring alias "${value}" is defined more than once.`,
          });
        values.add(normalized);
      }
    }
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
  mode: ConfigurationValidationMode,
  issues: ConfigurationIssue[],
): void {
  collectDuplicateIds(bundle.sources, 'sources', 'sources', issues);

  const trackIds = new Set(bundle.search.tracks.map((track) => track.id));
  for (const [index, source] of bundle.sources.entries()) {
    validateSafeId(source.id, 'sources', `sources[${index}].id`, issues);
    if (
      mode === 'runtime' &&
      source.enabled &&
      source.type === 'generic-jsonld'
    )
      issues.push({
        code: 'CONFIG_REFERENCE_INVALID',
        section: 'sources',
        fieldPath: `sources[${index}].type`,
        message:
          'The legacy generic-jsonld type is not collected. Use generic-page or generic-job-list.',
      });
    if (
      mode === 'runtime' &&
      source.enabled &&
      (source.type === 'generic-page' || source.type === 'generic-job-list') &&
      source.settings.allowBrowserFallback === true
    )
      issues.push({
        code: 'BROWSER_FALLBACK_EXTERNAL_UNSAFE',
        section: 'sources',
        fieldPath: `sources[${index}].settings.allowBrowserFallback`,
        message:
          'External browser fallback is disabled by the source network policy. Set allowBrowserFallback to false for HTTP-only collection.',
      });
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

  if (mode === 'runtime' && !bundle.sources.some((source) => source.enabled)) {
    issues.push({
      code: 'CONFIG_REFERENCE_INVALID',
      section: 'sources',
      fieldPath: 'sources',
      message: 'At least one source must be enabled.',
    });
  }

  if (mode === 'runtime') {
    const readiness = inspectSourceReadiness(bundle.sources);
    for (const [index, source] of readiness.sources.entries()) {
      if (!source.enabled || source.classification !== 'PLACEHOLDER') continue;
      issues.push({
        code: 'PLACEHOLDER_SOURCE_NOT_ALLOWED',
        section: 'sources',
        fieldPath: `sources[${index}]`,
        message: `Source "${source.id}" is a documentation placeholder. Configure a real source URL or ATS identifier before running collection.`,
      });
    }
  }
}

function validateWeights(
  bundle: ConfigurationBundle,
  issues: ConfigurationIssue[],
): void {
  const total = WEIGHTED_SCORING_COMPONENT_KEYS.reduce(
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
