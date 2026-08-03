import type { ConfigurationBundle } from './configuration-bundle.js';

export interface ConfigurationSummary {
  readonly candidateDisplayName: string;
  readonly enabledTrackCount: number;
  readonly enabledSourceCount: number;
  readonly enabledCompanyCount: number;
  readonly dailyRecommendationLimit: number;
}

export function summarizeConfiguration(
  bundle: ConfigurationBundle,
): ConfigurationSummary {
  return {
    candidateDisplayName: bundle.candidate.displayName,
    enabledTrackCount: bundle.search.tracks.filter((track) => track.enabled)
      .length,
    enabledSourceCount: bundle.sources.filter((source) => source.enabled)
      .length,
    enabledCompanyCount: (bundle.companies ?? []).filter(
      (company) => company.enabled,
    ).length,
    dailyRecommendationLimit:
      bundle.search.preferences.dailyRecommendationLimit,
  };
}
