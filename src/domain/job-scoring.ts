import type { CandidateProfile } from './candidate-profile.js';
import type {
  EnrichedNormalizedJob,
  NormalizedEducationRequirement,
} from './job-processing.js';
import type {
  ScoreComponentResult,
  ScoreReason,
  ScoreResult,
} from './score-result.js';
import type {
  ScoringAlias,
  ScoringComponentKey,
  ScoringConfig,
} from './scoring-config.js';
import type {
  SearchConfiguration,
  SearchTrack,
} from './search-configuration.js';

export const SCORING_VERSION = 'deterministic-scoring-v1';

export interface ScoringSourceContext {
  readonly type?: string;
  readonly tags: readonly string[];
}

export interface ScoreJobInput {
  readonly job: EnrichedNormalizedJob;
  readonly candidate: CandidateProfile;
  readonly track: SearchTrack;
  readonly search: SearchConfiguration;
  readonly scoring: ScoringConfig;
  readonly source: ScoringSourceContext;
  readonly evaluationTime: string;
}

interface ComponentValue {
  readonly score: number;
  readonly confidence: number;
  readonly reasons: readonly ScoreReason[];
  readonly missing?: string;
}

export function scoreJobAgainstTrack(input: ScoreJobInput): ScoreResult {
  const values: Readonly<Record<ScoringComponentKey, ComponentValue>> = {
    titleRelevance: scoreTitleRelevance(input),
    skills: scoreSkills(input),
    experience: scoreExperience(input),
    location: scoreLocation(input),
    workAuthorization: scoreWorkAuthorization(input),
    education: scoreEducation(input),
    language: scoreLanguage(input),
    companyPreference: scoreCompanyPreference(input),
    freshness: scoreFreshness(input),
    salary: scoreSalary(input),
    sourceQuality: scoreSourceQuality(input),
    applicationSimplicity: scoreApplicationDestination(input),
    trackMatch: scoreTrackMatch(input),
  };
  const componentOrder: readonly ScoringComponentKey[] = [
    'titleRelevance',
    'trackMatch',
    'skills',
    'experience',
    'education',
    'location',
    'workAuthorization',
    'language',
    'companyPreference',
    'freshness',
    'salary',
    'applicationSimplicity',
    'sourceQuality',
  ];
  const components = componentOrder.map((key) =>
    buildComponent(key, values[key], input.scoring),
  );
  const totalScore = round4(
    components.reduce((sum, component) => sum + component.contribution, 0),
  );
  const byKey = new Map(
    components.map((component) => [component.key, component]),
  );
  const opportunityScore = round4(
    totalScore * 0.55 +
      requiredComponent(byKey, 'freshness').rawScore * 0.15 +
      requiredComponent(byKey, 'salary').rawScore * 0.1 +
      requiredComponent(byKey, 'applicationSimplicity').rawScore * 0.1 +
      requiredComponent(byKey, 'sourceQuality').rawScore * 0.1,
  );
  const reasons = components.flatMap((component) => component.reasons);
  return {
    totalScore,
    opportunityScore,
    selectedTrackId: input.track.id,
    components,
    positiveReasons: uniqueReasons(
      reasons.filter((item) => item.impact === 'POSITIVE'),
    ),
    concerns: uniqueReasons(
      reasons.filter((item) => item.impact === 'NEGATIVE'),
    ),
    missingData: [
      ...new Set(componentOrder.flatMap((key) => values[key].missing ?? [])),
    ].sort(compareText),
    completeness: round4(
      components.reduce((sum, component) => sum + component.confidence, 0) /
        components.length,
    ),
  };
}

export function selectBestTrack(
  input: Omit<ScoreJobInput, 'track'> & {
    readonly tracks: readonly SearchTrack[];
  },
): ScoreResult {
  const scores = input.tracks
    .filter((track) => track.enabled)
    .map((track) => scoreJobAgainstTrack({ ...input, track }))
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        right.opportunityScore - left.opportunityScore ||
        compareText(left.selectedTrackId, right.selectedTrackId),
    );
  const selected = scores[0];
  if (selected === undefined)
    throw new RangeError('At least one enabled search track is required.');
  return selected;
}

export function scoreSkills(input: ScoreJobInput): ComponentValue {
  if (input.job.skillRequirements.length === 0)
    return missing(
      'SKILL_REQUIREMENTS_UNAVAILABLE',
      'Job skill requirements are unavailable.',
      'skills',
    );
  const aliases = input.scoring.settings.skillAliases;
  const candidate = new Set(
    input.candidate.skills.map((skill) => canonical(skill.name, aliases)),
  );
  const requirements = distinctBy(
    input.job.skillRequirements.map((item) => ({
      name: item.canonicalName,
      required: item.requirement === 'REQUIRED',
    })),
    (item) => canonical(item.name, aliases),
  );
  let earned = 0;
  let possible = 0;
  const reasons: ScoreReason[] = [];
  for (const requirement of requirements) {
    const required = requirement.required;
    const points = required ? 2 : 1;
    possible += points;
    const name = canonical(requirement.name, aliases);
    if (candidate.has(name)) {
      earned += points;
      reasons.push(
        reason(
          required ? 'REQUIRED_SKILL_MATCHED' : 'PREFERRED_SKILL_MATCHED',
          `${requirement.name} matched the candidate profile.`,
          'POSITIVE',
          { skill: requirement.name },
        ),
      );
    } else if (required) {
      reasons.push(
        reason(
          'REQUIRED_SKILL_MISSING',
          `${requirement.name} is required but not present in the candidate profile.`,
          'NEGATIVE',
          { skill: requirement.name },
        ),
      );
    }
  }
  return value(possible === 0 ? 50 : (earned / possible) * 100, 0.95, reasons);
}

export function scoreExperience(input: ScoreJobInput): ComponentValue {
  const required = input.job.experienceRequirements
    .filter((item) => item.level === 'REQUIRED')
    .map((item) => item.minimumYears ?? 0);
  if (required.length === 0)
    return missing(
      'EXPERIENCE_REQUIREMENT_UNAVAILABLE',
      'Mandatory experience is not specified.',
      'experienceRequirement',
    );
  if (input.candidate.totalYearsExperience === undefined)
    return missing(
      'CANDIDATE_EXPERIENCE_UNAVAILABLE',
      'Candidate experience years are unavailable.',
      'candidateExperience',
    );
  const minimum = Math.max(...required);
  const gap = minimum - input.candidate.totalYearsExperience;
  if (gap <= 0)
    return value(100, 0.95, [
      reason(
        'EXPERIENCE_REQUIREMENT_MET',
        'Candidate experience meets the mandatory minimum.',
        'POSITIVE',
        {
          requiredYears: minimum,
          candidateYears: input.candidate.totalYearsExperience,
        },
      ),
    ]);
  const tolerance = input.scoring.settings.experienceToleranceYears;
  const score =
    gap <= tolerance ? 75 : Math.max(0, 75 - (gap - tolerance) * 20);
  return value(score, 0.95, [
    reason(
      gap <= tolerance ? 'SMALL_EXPERIENCE_GAP' : 'EXPERIENCE_GAP',
      'Candidate experience is below the stated minimum.',
      'NEGATIVE',
      { gapYears: gap },
    ),
  ]);
}

export function scoreTitleRelevance(input: ScoreJobInput): ComponentValue {
  const title = canonical(
    input.job.normalizedTitle,
    input.scoring.settings.titleAliases,
  );
  const targets = input.track.targetTitles.map((item) =>
    canonical(item, input.scoring.settings.titleAliases),
  );
  if (targets.includes(title))
    return value(100, 1, [
      reason(
        'TITLE_EXACT_MATCH',
        'Job title exactly matches a configured target title.',
        'POSITIVE',
      ),
    ]);
  const titleTokens = tokens(title);
  const best = Math.max(
    0,
    ...targets.map((target) => jaccard(titleTokens, tokens(target))),
  );
  return value(best * 100, best >= 0.5 ? 0.85 : 0.7, [
    reason(
      best >= 0.5 ? 'TITLE_TOKEN_MATCH' : 'TITLE_WEAK_MATCH',
      best >= 0.5
        ? 'Job title substantially overlaps a target title.'
        : 'Job title has limited target-title overlap.',
      best >= 0.5 ? 'POSITIVE' : 'NEGATIVE',
    ),
  ]);
}

export function scoreTrackMatch(input: ScoreJobInput): ComponentValue {
  const title = scoreTitleRelevance(input).score;
  const description = normalize(input.job.description ?? '');
  const included = input.track.includeKeywords.filter((keyword) =>
    containsPhrase(description, normalize(keyword)),
  ).length;
  const excluded = input.track.excludeKeywords.filter((keyword) =>
    containsPhrase(description, normalize(keyword)),
  ).length;
  const keywordScore =
    input.track.includeKeywords.length === 0
      ? 60
      : (included / input.track.includeKeywords.length) * 100;
  const score = Math.max(0, title * 0.6 + keywordScore * 0.4 - excluded * 20);
  return value(score, input.job.description === undefined ? 0.6 : 0.85, [
    reason(
      score >= 60 ? 'TRACK_ALIGNED' : 'TRACK_WEAK_ALIGNMENT',
      score >= 60
        ? 'Title and configured track evidence align.'
        : 'Configured track evidence is weak.',
      score >= 60 ? 'POSITIVE' : 'NEGATIVE',
      { includedKeywords: included, excludedKeywords: excluded },
    ),
  ]);
}

export function scoreEducation(input: ScoreJobInput): ComponentValue {
  const required = input.job.educationRequirements.filter(
    (item) => item.requirement === 'REQUIRED',
  );
  if (required.length === 0)
    return value(
      80,
      0.7,
      [
        reason(
          'EDUCATION_NOT_REQUIRED',
          'No mandatory education requirement was found.',
          'NEUTRAL',
        ),
      ],
      'educationRequirement',
    );
  const met = required.every((item) => educationMet(item, input.candidate));
  return value(met ? 100 : 35, 0.9, [
    reason(
      met ? 'EDUCATION_REQUIREMENT_MET' : 'EDUCATION_REQUIREMENT_NOT_MET',
      met
        ? 'Candidate education meets the requirement.'
        : 'Candidate education does not meet the stated requirement.',
      met ? 'POSITIVE' : 'NEGATIVE',
    ),
  ]);
}

export function scoreLocation(input: ScoreJobInput): ComponentValue {
  if (input.job.location.remoteScope === 'WORLDWIDE')
    return value(100, 0.95, [
      reason(
        'WORLDWIDE_REMOTE_MATCH',
        'Worldwide remote work is compatible.',
        'POSITIVE',
      ),
    ]);
  if (input.job.location.remotePolicy === 'remote')
    return value(90, 0.85, [
      reason(
        'REMOTE_LOCATION_MATCH',
        'Remote work matches configured preferences.',
        'POSITIVE',
      ),
    ]);
  const countries = input.job.location.countryCodes;
  if (countries.length === 0)
    return missing(
      'LOCATION_UNAVAILABLE',
      'Job location is unavailable.',
      'location',
    );
  const exact = countries.includes(input.candidate.location.country);
  const relocation =
    input.candidate.location.willingToRelocate &&
    countries.some((country) =>
      input.candidate.location.relocationCountries.includes(country),
    );
  return value(exact ? 100 : relocation ? 75 : 50, 0.95, [
    reason(
      exact
        ? 'LOCATION_EXACT_MATCH'
        : relocation
          ? 'RELOCATION_MATCH'
          : 'LOCATION_NON_PREFERRED',
      exact
        ? 'Job country matches candidate location.'
        : relocation
          ? 'Job country matches relocation preferences.'
          : 'Job location is eligible but not preferred.',
      exact || relocation ? 'POSITIVE' : 'NEUTRAL',
    ),
  ]);
}

export function scoreWorkAuthorization(input: ScoreJobInput): ComponentValue {
  if (input.job.workAuthorizationRequirements.length === 0)
    return missing(
      'WORK_AUTHORIZATION_UNAVAILABLE',
      'Job authorization requirements are unavailable.',
      'workAuthorization',
    );
  const authorized = new Set([
    ...input.candidate.citizenships,
    ...input.candidate.workAuthorizations
      .filter((item) => item.status !== 'sponsorship-required')
      .map((item) => item.country),
  ]);
  const matches = input.job.workAuthorizationRequirements.every(
    (item) =>
      item.countryCode === undefined ||
      authorized.has(item.countryCode) ||
      item.sponsorshipAvailable === true,
  );
  return value(matches ? 100 : 40, 0.9, [
    reason(
      matches ? 'WORK_AUTHORIZATION_MATCH' : 'WORK_AUTHORIZATION_UNCERTAIN',
      matches
        ? 'Structured work-authorization evidence is compatible.'
        : 'Authorization evidence is uncertain despite hard-filter eligibility.',
      matches ? 'POSITIVE' : 'NEGATIVE',
    ),
  ]);
}

export function scoreCompanyPreference(input: ScoreJobInput): ComponentValue {
  const preferredIndustry =
    input.job.industry !== undefined &&
    input.track.preferredIndustries.some(
      (item) => normalize(item) === normalize(input.job.industry ?? ''),
    );
  return value(
    preferredIndustry ? 100 : 60,
    input.job.industry === undefined ? 0.5 : 0.85,
    [
      reason(
        preferredIndustry
          ? 'PREFERRED_INDUSTRY_MATCH'
          : 'COMPANY_PREFERENCE_NEUTRAL',
        preferredIndustry
          ? 'Job industry matches a track preference.'
          : 'No positive company preference was established.',
        preferredIndustry ? 'POSITIVE' : 'NEUTRAL',
      ),
    ],
    input.job.industry === undefined ? 'companyIndustry' : undefined,
  );
}

export function scoreFreshness(input: ScoreJobInput): ComponentValue {
  const timestamp = input.job.publishedAt ?? input.job.firstSeenAt;
  const evaluated = Date.parse(input.evaluationTime);
  const observed = Date.parse(timestamp);
  if (
    !Number.isFinite(evaluated) ||
    !Number.isFinite(observed) ||
    observed > evaluated
  )
    return missing(
      'FRESHNESS_UNAVAILABLE',
      'A valid non-future publication date is unavailable.',
      'publishedAt',
    );
  const days = (evaluated - observed) / 86_400_000;
  const full = input.scoring.settings.freshnessFullScoreDays;
  const horizon = input.scoring.settings.freshnessHorizonDays;
  const score =
    days <= full
      ? 100
      : Math.max(0, 100 * (1 - (days - full) / Math.max(1, horizon - full)));
  return value(
    score,
    input.job.publishedAt === undefined ? 0.75 : 1,
    [
      reason(
        days <= full ? 'JOB_FRESH' : 'JOB_AGE_DECAY',
        days <= full
          ? 'Job is within the full-freshness window.'
          : 'Freshness score decays deterministically with age.',
        days <= full ? 'POSITIVE' : 'NEUTRAL',
        { ageDays: round4(days) },
      ),
    ],
    input.job.publishedAt === undefined ? 'publishedAt' : undefined,
  );
}

export function scoreSalary(input: ScoreJobInput): ComponentValue {
  const target = input.search.preferences.desiredSalary;
  const salary = input.job.salary;
  if (
    target === undefined ||
    salary === undefined ||
    salary.minimumAmount === undefined
  )
    return missing(
      'SALARY_UNAVAILABLE',
      'Comparable salary information is unavailable.',
      'salary',
    );
  const period = salary.period.toLocaleLowerCase('en-US');
  if (salary.currency !== target.currency || period !== target.period)
    return missing(
      'SALARY_NOT_COMPARABLE',
      'Salary currency or period is not directly comparable.',
      'salary',
    );
  const targetMinimum = target.minimum ?? 0;
  const ratio = targetMinimum === 0 ? 1 : salary.minimumAmount / targetMinimum;
  return value(Math.min(100, ratio * 100), 0.95, [
    reason(
      ratio >= 1 ? 'SALARY_TARGET_MET' : 'SALARY_BELOW_TARGET',
      ratio >= 1
        ? 'Salary meets the configured target.'
        : 'Salary is below the configured target.',
      ratio >= 1 ? 'POSITIVE' : 'NEGATIVE',
    ),
  ]);
}

export function scoreApplicationDestination(
  input: ScoreJobInput,
): ComponentValue {
  if (input.job.applicationUrl === undefined)
    return missing(
      'APPLICATION_DESTINATION_UNAVAILABLE',
      'Application destination is unavailable.',
      'applicationDestination',
    );
  const direct = ['greenhouse', 'lever'].includes(input.source.type ?? '');
  return value(direct ? 100 : 75, 0.9, [
    reason(
      direct ? 'DIRECT_ATS_APPLICATION' : 'PUBLIC_APPLICATION_DESTINATION',
      direct
        ? 'A direct configured ATS destination is available.'
        : 'A valid public application destination is available.',
      'POSITIVE',
    ),
  ]);
}

export function scoreSourceQuality(input: ScoreJobInput): ComponentValue {
  const configured =
    input.source.type === undefined
      ? undefined
      : input.scoring.settings.sourceQuality[input.source.type];
  if (configured === undefined)
    return missing(
      'SOURCE_QUALITY_UNAVAILABLE',
      'Source quality is not configured.',
      'sourceQuality',
    );
  return value(configured, 0.9, [
    reason(
      configured >= 80 ? 'TRUSTED_SOURCE' : 'SOURCE_QUALITY_CONFIGURED',
      'Source quality comes from deterministic configuration.',
      configured >= 80 ? 'POSITIVE' : 'NEUTRAL',
      { sourceType: input.source.type ?? null },
    ),
  ]);
}

export function scoreLanguage(input: ScoreJobInput): ComponentValue {
  const required = input.job.languageRequirements.filter(
    (item) => item.requirement === 'REQUIRED',
  );
  if (required.length === 0)
    return value(
      80,
      0.7,
      [
        reason(
          'LANGUAGE_NOT_REQUIRED',
          'No mandatory language requirement was found.',
          'NEUTRAL',
        ),
      ],
      'languageRequirement',
    );
  const codes = new Set(input.candidate.languages.map((item) => item.code));
  const matched = required.filter((item) => codes.has(item.code)).length;
  return value((matched / required.length) * 100, 0.9, [
    reason(
      matched === required.length
        ? 'LANGUAGE_REQUIREMENTS_MET'
        : 'LANGUAGE_REQUIREMENTS_PARTIAL',
      matched === required.length
        ? 'Mandatory languages are present.'
        : 'Some mandatory languages are missing.',
      matched === required.length ? 'POSITIVE' : 'NEGATIVE',
    ),
  ]);
}

function buildComponent(
  key: ScoringComponentKey,
  item: ComponentValue,
  scoring: ScoringConfig,
): ScoreComponentResult {
  const weight = key === 'trackMatch' ? 0 : scoring.weights[key];
  return {
    key,
    rawScore: round4(item.score),
    weight,
    contribution: round4((item.score * weight) / 100),
    reasons: item.reasons,
    confidence: round4(item.confidence),
  };
}

function value(
  score: number,
  confidence: number,
  reasons: readonly ScoreReason[],
  missing?: string,
): ComponentValue {
  assertRange(score, 0, 100, 'score');
  assertRange(confidence, 0, 1, 'confidence');
  return {
    score: round4(score),
    confidence: round4(confidence),
    reasons,
    ...(missing === undefined ? {} : { missing }),
  };
}

function missing(code: string, message: string, key: string): ComponentValue {
  return value(50, 0.25, [reason(code, message, 'MISSING_DATA')], key);
}

function reason(
  code: string,
  message: string,
  impact: ScoreReason['impact'],
  details?: ScoreReason['details'],
): ScoreReason {
  return {
    code,
    message,
    impact,
    ...(details === undefined ? {} : { details }),
  };
}

function canonical(value: string, aliases: readonly ScoringAlias[]): string {
  const key = normalize(value);
  for (const alias of aliases) {
    const canonicalKey = normalize(alias.canonical);
    if (
      key === canonicalKey ||
      alias.aliases.some((item) => normalize(item) === key)
    )
      return canonicalKey;
  }
  return key;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokens(value: string): ReadonlySet<string> {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function jaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((item) => right.has(item)).length;
  return shared / new Set([...left, ...right]).size;
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

function educationMet(
  requirement: NormalizedEducationRequirement,
  candidate: CandidateProfile,
): boolean {
  if (
    requirement.acceptsEquivalentExperience &&
    candidate.totalYearsExperience !== undefined
  )
    return true;
  const order = ['secondary', 'vocational', 'bachelor', 'master', 'doctorate'];
  const required = order.indexOf(requirement.level);
  return candidate.education.some(
    (item) => order.indexOf(item.level) >= required,
  );
}

function distinctBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  const result = new Map<string, T>();
  for (const item of items)
    if (!result.has(key(item))) result.set(key(item), item);
  return [...result.values()];
}

function uniqueReasons(items: readonly ScoreReason[]): readonly ScoreReason[] {
  return [
    ...distinctBy(items, (item) => `${item.code}\u0000${item.message}`),
  ].sort(
    (left, right) =>
      compareText(left.code, right.code) ||
      compareText(left.message, right.message),
  );
}

function requiredComponent(
  values: ReadonlyMap<ScoringComponentKey, ScoreComponentResult>,
  key: ScoringComponentKey,
): ScoreComponentResult {
  const component = values.get(key);
  if (component === undefined)
    throw new Error(`Missing scoring component ${key}.`);
  return component;
}

function assertRange(
  number: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isFinite(number) || number < minimum || number > maximum)
    throw new RangeError(
      `${field} must be finite and between ${minimum} and ${maximum}.`,
    );
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
