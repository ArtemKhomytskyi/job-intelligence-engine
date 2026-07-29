import type { Percentage } from './value-objects.js';

export const SCORING_COMPONENT_KEYS = [
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

export type ScoringComponentKey = (typeof SCORING_COMPONENT_KEYS)[number];

export type ScoringWeights = Readonly<Record<ScoringComponentKey, Percentage>>;

export interface ScoringConfig {
  readonly weights: ScoringWeights;
}
