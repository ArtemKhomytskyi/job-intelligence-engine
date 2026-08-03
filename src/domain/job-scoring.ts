import type { CandidateProfile } from './candidate-profile.js';
import type {
  EnrichedNormalizedJob,
  NormalizedEducationRequirement,
} from './job-processing.js';
import type {
  MultiTrackScoreResult,
  ScoreComponentResult,
  ScoreReason,
  ScoreResult,
} from './score-result.js';
import {
  analyzeRoleTitle,
  exactTitleMatches,
  phraseMatches,
} from './role-matching.js';
import type {
  ScoringAlias,
  ScoringComponentKey,
  ScoringConfig,
} from './scoring-config.js';
import type {
  SearchConfiguration,
  SearchTrack,
} from './search-configuration.js';

export const SCORING_VERSION = 'deterministic-scoring-v2';

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
  const byKey = new Map(
    components.map((component) => [component.key, component]),
  );
  const candidateFitScore = round4(
    requiredComponent(byKey, 'titleRelevance').rawScore * 0.3 +
      requiredComponent(byKey, 'trackMatch').rawScore * 0.25 +
      requiredComponent(byKey, 'skills').rawScore * 0.2 +
      requiredComponent(byKey, 'experience').rawScore * 0.15 +
      requiredComponent(byKey, 'location').rawScore * 0.04 +
      requiredComponent(byKey, 'workAuthorization').rawScore * 0.03 +
      requiredComponent(byKey, 'language').rawScore * 0.03,
  );
  const opportunityScore = round4(
    requiredComponent(byKey, 'freshness').rawScore * 0.35 +
      requiredComponent(byKey, 'salary').rawScore * 0.2 +
      requiredComponent(byKey, 'applicationSimplicity').rawScore * 0.2 +
      requiredComponent(byKey, 'sourceQuality').rawScore * 0.25,
  );
  const validTrackMatch =
    requiredComponent(byKey, 'trackMatch').reasons.every(
      (item) =>
        ![
          'TRACK_REQUIRED_EVIDENCE_MISSING',
          'EXCLUDED_TITLE_EXACT',
          'EXCLUDED_TITLE_PHRASE',
          'EXCLUDED_ROLE_FAMILY',
          'PROHIBITED_ROLE_EVIDENCE',
          'NO_VALID_TRACK_MATCH',
        ].includes(item.code),
    ) && requiredComponent(byKey, 'trackMatch').rawScore >= 60;
  const totalScore = round4(
    validTrackMatch
      ? candidateFitScore * 0.8 + opportunityScore * 0.2
      : Math.min(39, candidateFitScore * 0.4 + opportunityScore * 0.1),
  );
  const reasons = components.flatMap((component) => component.reasons);
  return {
    totalScore,
    candidateFitScore,
    opportunityScore,
    selectedTrackId: input.track.id,
    validTrackMatch,
    ...(validTrackMatch ? {} : { exclusionReason: 'NO_VALID_TRACK_MATCH' }),
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
  const result = evaluateTracks(input);
  if (result.score === undefined)
    throw new RangeError('No enabled track produced a valid role match.');
  return result.score;
}

export function evaluateTracks(
  input: Omit<ScoreJobInput, 'track'> & {
    readonly tracks: readonly SearchTrack[];
  },
): MultiTrackScoreResult {
  const scores = input.tracks
    .filter((track) => track.enabled)
    .map((track) => scoreJobAgainstTrack({ ...input, track }))
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        right.opportunityScore - left.opportunityScore ||
        compareText(left.selectedTrackId, right.selectedTrackId),
    );
  if (scores.length === 0)
    throw new RangeError('At least one enabled search track is required.');
  const valid = scores.filter((score) => score.validTrackMatch === true);
  const selected = valid[0];
  const evaluations = scores.map((score) => ({
    trackId: score.selectedTrackId,
    validMatch: score.validTrackMatch === true,
    candidateFitScore: score.candidateFitScore ?? 0,
    opportunityScore: score.opportunityScore,
    finalScore: score.totalScore,
    positiveEvidence: score.positiveReasons,
    negativeEvidence: score.concerns,
    missingEvidence: score.missingData,
    ...(score.exclusionReason === undefined
      ? {}
      : { exclusionReason: score.exclusionReason }),
  }));
  return selected === undefined
    ? { evaluations, exclusionReason: 'NO_VALID_TRACK_MATCH' }
    : { score: { ...selected, trackEvaluations: evaluations }, evaluations };
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
    candidateSkills(input.candidate).map((skill) =>
      canonical(skill.name, aliases),
    ),
  );
  const requirements = distinctBy(
    [
      ...input.job.skillRequirements.map((item) => ({
        name: item.canonicalName,
        required: item.requirement === 'REQUIRED',
      })),
      ...(input.track.requiredSkills ?? []).map((name) => ({
        name,
        required: true,
      })),
      ...input.track.preferredSkills.map((name) => ({
        name,
        required: false,
      })),
      ...(input.track.optionalSkills ?? []).map((name) => ({
        name,
        required: false,
      })),
    ],
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
  return value(possible === 0 ? 0 : (earned / possible) * 100, 0.95, reasons);
}

export function scoreExperience(input: ScoreJobInput): ComponentValue {
  const required = [
    ...input.job.experienceRequirements
      .filter((item) => item.level === 'REQUIRED')
      .map((item) => item.minimumYears ?? 0),
    ...(input.track.roleSpecificExperienceYears === undefined
      ? []
      : [input.track.roleSpecificExperienceYears]),
  ];
  if (required.length === 0)
    return missing(
      'EXPERIENCE_REQUIREMENT_UNAVAILABLE',
      'Mandatory experience is not specified.',
      'experienceRequirement',
    );
  const relevantYears = candidateRelevantExperience(input);
  if (relevantYears === undefined)
    return missing(
      'CANDIDATE_EXPERIENCE_UNAVAILABLE',
      'Candidate experience years are unavailable.',
      'candidateExperience',
    );
  const minimum = Math.max(...required);
  const gap = minimum - relevantYears;
  if (gap <= 0)
    return value(100, 0.95, [
      reason(
        'EXPERIENCE_REQUIREMENT_MET',
        'Candidate experience meets the mandatory minimum.',
        'POSITIVE',
        {
          requiredYears: minimum,
          candidateYears: relevantYears,
          totalCandidateYears: input.candidate.totalYearsExperience ?? null,
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
  const aliases = [
    ...input.scoring.settings.titleAliases,
    ...(input.candidate.targetRoles?.titleAliases ?? []),
  ];
  const title = input.job.normalizedTitle;
  const candidateTargets = input.candidate.targetRoles;
  const tiers = [
    {
      score: 100,
      code: 'PRIMARY_TITLE_MATCH',
      titles: candidateTargets?.primaryTitles ?? [],
    },
    {
      score: 90,
      code: 'SECONDARY_TITLE_MATCH',
      titles: candidateTargets?.secondaryTitles ?? [],
    },
    {
      score: 75,
      code: 'ADJACENT_TITLE_MATCH',
      titles: candidateTargets?.adjacentTitles ?? [],
    },
    {
      score: 60,
      code: 'EXPLORATORY_TITLE_MATCH',
      titles: candidateTargets?.exploratoryTitles ?? [],
    },
    {
      score: 100,
      code: 'TRACK_TARGET_TITLE_MATCH',
      titles: candidateTargets === undefined ? input.track.targetTitles : [],
    },
    {
      score: 75,
      code: 'TRACK_ADJACENT_TITLE_MATCH',
      titles:
        candidateTargets === undefined
          ? (input.track.adjacentTitles ?? [])
          : [],
    },
  ] as const;
  const matched = tiers.find((tier) =>
    tier.titles.some((target) => exactTitleMatches(title, target, aliases)),
  );
  if (matched !== undefined)
    return value(matched.score, 1, [
      reason(
        matched.code,
        `Matched configured title: ${input.job.normalizedTitle}.`,
        'POSITIVE',
        { score: matched.score },
      ),
    ]);
  const jobFamilies = analyzeRoleTitle(title, aliases).families;
  const targetFamilies = new Set([
    ...(candidateTargets === undefined
      ? configuredTrackFamilies(input.track, aliases)
      : candidateTargets.roleFamilies),
  ]);
  const shared = jobFamilies.filter((family) => targetFamilies.has(family));
  if (shared.length > 0)
    return value(70, 0.9, [
      reason(
        'ROLE_FAMILY_MATCH',
        `Matched role family: ${shared[0] ?? ''}.`,
        'POSITIVE',
        { roleFamily: shared[0] ?? '' },
      ),
    ]);
  return value(0, 1, [
    reason(
      'TITLE_ROLE_MISMATCH',
      'Job title and role family do not match this track.',
      'NEGATIVE',
    ),
  ]);
}

export function scoreTrackMatch(input: ScoreJobInput): ComponentValue {
  const evidenceText = jobEvidenceText(input.job);
  const aliases = [
    ...input.scoring.settings.titleAliases,
    ...(input.candidate.targetRoles?.titleAliases ?? []),
  ];
  const jobAnalysis = analyzeRoleTitle(input.job.normalizedTitle, aliases);
  const trackTitle = trackTitleRelevance(input, aliases, jobAnalysis.families);
  const excludedTitle = [
    ...(input.track.excludedTitles ?? []),
    ...(input.candidate.targetRoles?.excludedTitles ?? []),
  ].find((item) => exactTitleMatches(input.job.normalizedTitle, item, aliases));
  if (excludedTitle !== undefined)
    return value(0, 1, [
      reason(
        'EXCLUDED_TITLE_EXACT',
        `Excluded title matched: ${excludedTitle}.`,
        'NEGATIVE',
        { title: excludedTitle },
      ),
    ]);
  const excludedPhrase = input.candidate.targetRoles?.excludedTitlePhrases.find(
    (item) => phraseMatches(input.job.normalizedTitle, item),
  );
  if (excludedPhrase !== undefined)
    return value(0, 1, [
      reason(
        'EXCLUDED_TITLE_PHRASE',
        `Excluded title phrase matched: ${excludedPhrase}.`,
        'NEGATIVE',
        { phrase: excludedPhrase },
      ),
    ]);
  const excludedFamily = jobAnalysis.families.find((family) =>
    [
      ...(input.track.excludedRoleFamilies ?? []),
      ...(input.candidate.targetRoles?.excludedRoleFamilies ?? []),
    ].includes(family),
  );
  if (excludedFamily !== undefined)
    return value(0, 1, [
      reason(
        'EXCLUDED_ROLE_FAMILY',
        `Excluded role family detected: ${excludedFamily}.`,
        'NEGATIVE',
        { roleFamily: excludedFamily },
      ),
    ]);
  const prohibited =
    input.candidate.evidencePreferences?.prohibitedConcepts.find((item) =>
      phraseMatches(evidenceText, item),
    );
  if (prohibited !== undefined)
    return value(0, 0.95, [
      reason(
        'PROHIBITED_ROLE_EVIDENCE',
        `Prohibited role evidence matched: ${prohibited}.`,
        'NEGATIVE',
        { evidence: prohibited },
      ),
    ]);
  const excludedSkill = (input.track.excludedSkills ?? []).find((item) =>
    input.job.skillRequirements.some((skill) =>
      exactTitleMatches(
        skill.canonicalName,
        item,
        input.scoring.settings.skillAliases,
      ),
    ),
  );
  if (excludedSkill !== undefined)
    return value(0, 0.95, [
      reason(
        'PROHIBITED_ROLE_EVIDENCE',
        `Excluded skill or domain signal matched: ${excludedSkill}.`,
        'NEGATIVE',
        { evidence: excludedSkill },
      ),
    ]);
  const missingMandatory = (
    input.candidate.evidencePreferences?.mandatoryConcepts ?? []
  ).filter((item) => !phraseMatches(evidenceText, item));
  if (missingMandatory.length > 0)
    return value(0, 0.95, [
      reason(
        'TRACK_REQUIRED_EVIDENCE_MISSING',
        `Mandatory candidate concepts are missing: ${missingMandatory.join(', ')}.`,
        'NEGATIVE',
        { missingCount: missingMandatory.length },
      ),
    ]);
  const requiredEvidence = input.track.requiredEvidence ?? [];
  const missingRequired = requiredEvidence.filter(
    (item) => !phraseMatches(evidenceText, item),
  );
  if (missingRequired.length > 0)
    return value(0, 0.95, [
      reason(
        'TRACK_REQUIRED_EVIDENCE_MISSING',
        `Required track evidence is missing: ${missingRequired.join(', ')}.`,
        'NEGATIVE',
        { missingCount: missingRequired.length },
      ),
    ]);
  if (
    input.job.seniority !== undefined &&
    (input.track.acceptableSeniorities?.length ?? 0) > 0 &&
    !input.track.acceptableSeniorities?.includes(input.job.seniority)
  )
    return value(0, 0.95, [
      reason(
        'TRACK_REQUIRED_EVIDENCE_MISSING',
        `Seniority ${input.job.seniority} is outside the acceptable range for track ${input.track.id}.`,
        'NEGATIVE',
        { seniority: input.job.seniority, trackId: input.track.id },
      ),
    ]);
  const included = input.track.includeKeywords.filter((keyword) =>
    phraseMatches(evidenceText, keyword),
  ).length;
  const preferred = (input.track.preferredEvidence ?? []).filter((keyword) =>
    phraseMatches(evidenceText, keyword),
  ).length;
  const excluded = [
    ...input.track.excludeKeywords,
    ...(input.track.negativeEvidence ?? []),
  ].filter((keyword) => phraseMatches(evidenceText, keyword)).length;
  if (trackTitle < 60)
    return value(0, 1, [
      reason(
        'NO_VALID_TRACK_MATCH',
        `Job had no valid role evidence for track ${input.track.id}.`,
        'NEGATIVE',
        { trackId: input.track.id },
      ),
    ]);
  const preferences = input.candidate.evidencePreferences;
  const strongPositive = (preferences?.strongPositive ?? []).filter((item) =>
    phraseMatches(evidenceText, item),
  );
  const moderatePositive = (preferences?.moderatePositive ?? []).filter(
    (item) => phraseMatches(evidenceText, item),
  );
  const strongNegative = (preferences?.strongNegative ?? []).filter((item) =>
    phraseMatches(evidenceText, item),
  );
  const moderateNegative = (preferences?.moderateNegative ?? []).filter(
    (item) => phraseMatches(evidenceText, item),
  );
  const evidencePossible =
    input.track.includeKeywords.length +
    (input.track.preferredEvidence?.length ?? 0);
  const evidenceScore =
    evidencePossible === 0
      ? trackTitle
      : ((included + preferred) / evidencePossible) * 100;
  const preferenceAdjustment =
    strongPositive.length * 10 +
    moderatePositive.length * 5 -
    strongNegative.length * 25 -
    moderateNegative.length * 10;
  const score = Math.max(
    0,
    Math.min(
      100,
      trackTitle * 0.75 +
        evidenceScore * 0.25 -
        excluded * 25 +
        preferenceAdjustment,
    ),
  );
  return value(score, input.job.description === undefined ? 0.8 : 0.95, [
    reason(
      score >= 60 ? 'TRACK_ALIGNED' : 'TRACK_WEAK_ALIGNMENT',
      score >= 60
        ? `Valid role evidence matched track ${input.track.id}.`
        : `Role evidence was insufficient for track ${input.track.id}.`,
      score >= 60 ? 'POSITIVE' : 'NEGATIVE',
      {
        includedKeywords: included,
        preferredEvidence: preferred,
        excludedKeywords: excluded,
        strongPositiveEvidence: strongPositive.length,
        moderatePositiveEvidence: moderatePositive.length,
        strongNegativeEvidence: strongNegative.length,
        moderateNegativeEvidence: moderateNegative.length,
      },
    ),
  ]);
}

function trackTitleRelevance(
  input: ScoreJobInput,
  aliases: readonly import('./scoring-config.js').ScoringAlias[],
  jobFamilies: readonly string[],
): number {
  if (
    input.track.targetTitles.some((title) =>
      exactTitleMatches(input.job.normalizedTitle, title, aliases),
    )
  )
    return 100;
  if (
    (input.track.adjacentTitles ?? []).some((title) =>
      exactTitleMatches(input.job.normalizedTitle, title, aliases),
    )
  )
    return 75;
  const trackFamilies = configuredTrackFamilies(input.track, aliases);
  return jobFamilies.some((family) => trackFamilies.has(family)) ? 70 : 0;
}

export function scoreEducation(input: ScoreJobInput): ComponentValue {
  const required = input.job.educationRequirements.filter(
    (item) => item.requirement === 'REQUIRED',
  );
  if (required.length === 0)
    return value(
      50,
      0.4,
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
  const preferredIndustries = [
    ...input.track.preferredIndustries,
    ...(input.candidate.careerPreferences?.preferredIndustries ?? []),
  ];
  const preferredIndustry =
    input.job.industry !== undefined &&
    preferredIndustries.some(
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
      50,
      0.4,
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
  return value(0, 0.25, [reason(code, message, 'MISSING_DATA')], key);
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

function candidateSkills(candidate: CandidateProfile) {
  return [
    ...candidate.skills,
    ...(candidate.capabilities?.programmingLanguages ?? []),
    ...(candidate.capabilities?.technicalSkills ?? []),
    ...(candidate.capabilities?.domainSkills ?? []),
    ...(candidate.capabilities?.toolsAndPlatforms ?? []),
  ];
}

function candidateRelevantExperience(input: ScoreJobInput): number | undefined {
  const configured = input.candidate.experience?.roleFamilies ?? [];
  if (configured.length === 0) return input.candidate.totalYearsExperience;
  const families = configuredTrackFamilies(input.track, [
    ...input.scoring.settings.titleAliases,
    ...(input.candidate.targetRoles?.titleAliases ?? []),
  ]);
  const relevant = Math.max(
    0,
    ...configured
      .filter((item) => families.has(item.roleFamily))
      .map((item) => item.years),
  );
  const total = input.candidate.totalYearsExperience;
  if (total === undefined) return relevant;
  return Math.min(
    total,
    relevant + input.scoring.settings.experienceToleranceYears,
  );
}

function configuredTrackFamilies(
  track: SearchTrack,
  aliases: readonly ScoringAlias[],
): ReadonlySet<string> {
  return new Set([
    ...(track.roleFamilies ?? []),
    ...track.targetTitles.flatMap(
      (title) => analyzeRoleTitle(title, aliases).families,
    ),
    ...(track.adjacentTitles ?? []).flatMap(
      (title) => analyzeRoleTitle(title, aliases).families,
    ),
  ]);
}

function jobEvidenceText(job: EnrichedNormalizedJob): string {
  const analysis = job.descriptionAnalysis;
  return [
    job.normalizedTitle,
    job.description ?? '',
    ...job.skillRequirements.flatMap((item) => [
      item.canonicalName,
      item.evidence,
    ]),
    ...(analysis?.responsibilities ?? []).map((item) => item.value),
    ...(analysis?.requiredQualifications ?? []).map((item) => item.value),
    ...(analysis?.preferredQualifications ?? []).map((item) => item.value),
    ...(analysis?.niceToHaveQualifications ?? []).map((item) => item.value),
  ].join(' ');
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
