import type { Percentage } from './value-objects.js';

export const WEIGHTED_SCORING_COMPONENT_KEYS = [
  'titleRelevance',
  'skills',
  'experience',
  'location',
  'workAuthorization',
  'education',
  'language',
  'companyPreference',
  'freshness',
  'salary',
  'sourceQuality',
  'applicationSimplicity',
] as const;

export const SCORING_COMPONENT_KEYS = [
  ...WEIGHTED_SCORING_COMPONENT_KEYS,
  'trackMatch',
] as const;

export type WeightedScoringComponentKey =
  (typeof WEIGHTED_SCORING_COMPONENT_KEYS)[number];
export type ScoringComponentKey = (typeof SCORING_COMPONENT_KEYS)[number];

export type ScoringWeights = Readonly<
  Record<WeightedScoringComponentKey, Percentage>
>;

export interface ScoringAlias {
  readonly canonical: string;
  readonly aliases: readonly string[];
}

export interface ScoringSettings {
  readonly titleAliases: readonly ScoringAlias[];
  readonly skillAliases: readonly ScoringAlias[];
  readonly experienceToleranceYears: number;
  readonly freshnessFullScoreDays: number;
  readonly freshnessHorizonDays: number;
  readonly sourceQuality: Readonly<Record<string, number>>;
  readonly selector: {
    readonly maximumSameTitle: number;
    readonly unknownCompanyJobsShareCap: boolean;
  };
}

export interface ScoringConfig {
  readonly weights: ScoringWeights;
  readonly settings: ScoringSettings;
}
