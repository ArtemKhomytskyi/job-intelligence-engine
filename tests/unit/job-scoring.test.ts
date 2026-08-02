import { describe, expect, it } from 'vitest';

import {
  createPercentage,
  scoreJobAgainstTrack,
  selectBestTrack,
  selectDiverseRecommendations,
  type CandidateProfile,
  type EnrichedNormalizedJob,
  type ScoringConfig,
  type ScoringSourceContext,
  type SearchConfiguration,
  type SearchTrack,
} from '../../src/domain/index.js';

const candidate: CandidateProfile = {
  id: 'candidate',
  displayName: 'Synthetic Candidate',
  totalYearsExperience: 4,
  professionalExperienceSummary: 'Synthetic.',
  education: [{ level: 'master', field: 'Computing' }],
  skills: [{ name: 'Postgres' }, { name: 'TypeScript' }],
  languages: [{ code: 'en', name: 'English', proficiency: 'fluent' }],
  citizenships: ['DE'],
  workAuthorizations: [{ country: 'DE', status: 'citizen' }],
  preferredEmploymentTypes: ['full-time'],
  location: {
    country: 'DE',
    willingToRelocate: true,
    relocationCountries: ['NL'],
  },
};

const track: SearchTrack = {
  id: 'data-engineering',
  displayName: 'Data Engineering',
  enabled: true,
  targetTitles: ['Data Engineer', 'Machine Learning Engineer'],
  includeKeywords: ['data platform', 'pipelines'],
  excludeKeywords: ['sales'],
  preferredSkills: ['PostgreSQL'],
  preferredIndustries: ['Software'],
  priority: 1,
  recommendationQuota: 2,
};

const scoring: ScoringConfig = {
  weights: {
    titleRelevance: createPercentage(18),
    skills: createPercentage(16),
    experience: createPercentage(12),
    location: createPercentage(10),
    workAuthorization: createPercentage(10),
    education: createPercentage(6),
    language: createPercentage(6),
    companyPreference: createPercentage(5),
    freshness: createPercentage(7),
    salary: createPercentage(4),
    sourceQuality: createPercentage(4),
    applicationSimplicity: createPercentage(2),
  },
  settings: {
    titleAliases: [
      { canonical: 'machine learning engineer', aliases: ['ml engineer'] },
    ],
    skillAliases: [{ canonical: 'postgresql', aliases: ['postgres'] }],
    experienceToleranceYears: 1,
    freshnessFullScoreDays: 3,
    freshnessHorizonDays: 60,
    sourceQuality: { greenhouse: 90, 'generic-page': 60 },
    selector: { maximumSameTitle: 2, unknownCompanyJobsShareCap: false },
  },
};

const search: SearchConfiguration = {
  tracks: [track],
  preferences: {
    preferredCountries: ['DE'],
    allowedRemotePolicies: ['remote', 'hybrid'],
    willingToRelocate: true,
    relocationCountries: ['NL'],
    preferredCompanySizes: ['medium'],
    allowedEmploymentTypes: ['full-time'],
    excludedSeniorityLevels: [],
    excludedCompanies: [],
    excludedIndustries: [],
    requiredExperience: { minimumYears: 0 },
    desiredSalary: {
      minimum: 80_000,
      currency: 'EUR',
      period: 'year',
    },
    dailyRecommendationLimit: 20,
    minimumAcceptableScore: createPercentage(55),
    maximumRecommendationsPerCompany: 2,
    hardFilters: {
      allowedCountries: [],
      allowedCountryGroups: [],
      rejectUnknownLocation: false,
      unknownCandidateLanguageLevelPolicy: 'allow',
      maximumSeniority: 'executive',
      maximumRequiredExperienceYears: 80,
      allowMandatoryPhd: true,
      excludedCompanies: [],
      excludedIndustries: [],
      excludedTitlePhrases: [],
      rejectUnknownIndustry: false,
      removableTrackingParameters: [],
      companyLegalSuffixes: [],
    },
  },
};

describe('deterministic job scoring', () => {
  it('returns every component with structured reasons, confidence, and stable totals', () => {
    const first = score(job(), track);
    const second = score(job(), track);
    expect(second).toEqual(first);
    expect(first.components).toHaveLength(13);
    expect(
      first.components.every(
        (item) => item.confidence >= 0 && item.confidence <= 1,
      ),
    ).toBe(true);
    expect(first.components.map((item) => item.key)).toContain('trackMatch');
    expect(first.totalScore).toBeGreaterThan(70);
    expect(first.opportunityScore).not.toBe(first.totalScore);
    expect(first.positiveReasons.every((item) => item.code.length > 0)).toBe(
      true,
    );
  });

  it('matches title and skill aliases without double counting', () => {
    const result = score(
      job({
        normalizedTitle: 'ML Engineer',
        skillRequirements: [
          skill('PostgreSQL', 'REQUIRED'),
          skill('Postgres', 'REQUIRED'),
        ],
      }),
      track,
    );
    expect(component(result, 'titleRelevance')).toMatchObject({
      rawScore: 100,
    });
    expect(component(result, 'skills')).toMatchObject({ rawScore: 100 });
    expect(
      component(result, 'skills').reasons.filter(
        (item) => item.code === 'REQUIRED_SKILL_MATCHED',
      ),
    ).toHaveLength(1);
  });

  it('distinguishes small and large experience gaps and missing experience', () => {
    expect(
      component(
        score(job({ experienceRequirements: [experience(5)] }), track),
        'experience',
      ).rawScore,
    ).toBe(75);
    expect(
      component(
        score(job({ experienceRequirements: [experience(8)] }), track),
        'experience',
      ).rawScore,
    ).toBeLessThan(50);
    expect(
      component(
        score(job({ experienceRequirements: [] }), track),
        'experience',
      ),
    ).toMatchObject({ rawScore: 50, confidence: 0.25 });
  });

  it('scores education, location, authorization, salary, freshness, application, and source evidence', () => {
    const result = score(job(), track);
    for (const key of [
      'education',
      'location',
      'workAuthorization',
      'salary',
      'freshness',
      'applicationSimplicity',
      'sourceQuality',
    ] as const)
      expect(component(result, key).rawScore).toBeGreaterThanOrEqual(80);
    expect(result.missingData).toEqual([]);
  });

  it('represents missing component data explicitly instead of hard-zeroing', () => {
    const complete = job({
      skillRequirements: [],
      experienceRequirements: [],
      educationRequirements: [],
      languageRequirements: [],
      workAuthorizationRequirements: [],
    });
    const {
      salary: _salary,
      publishedAt: _publishedAt,
      applicationUrl: _applicationUrl,
      industry: _industry,
      ...sparse
    } = complete;
    void _salary;
    void _publishedAt;
    void _applicationUrl;
    void _industry;
    const result = score(sparse, track, { tags: [] });
    expect(result.missingData).toEqual(
      expect.arrayContaining(['salary', 'skills', 'workAuthorization']),
    );
    expect(
      result.components.filter((item) => item.confidence === 0.25).length,
    ).toBeGreaterThan(3);
  });

  it('selects the winning track by score and then stable track ID', () => {
    const alternate = {
      ...track,
      id: 'alternate',
      targetTitles: ['Sales Manager'],
    };
    expect(
      selectBestTrack({
        job: job(),
        candidate,
        tracks: [alternate, track],
        search: { ...search, tracks: [alternate, track] },
        scoring,
        source: { type: 'greenhouse', tags: [] },
        evaluationTime: '2026-07-30T12:00:00.000Z',
      }).selectedTrackId,
    ).toBe(track.id);
    const tiedA = { ...track, id: 'a-track' };
    const tiedB = { ...track, id: 'b-track' };
    expect(
      selectBestTrack({
        job: job(),
        candidate,
        tracks: [tiedB, tiedA],
        search: { ...search, tracks: [tiedB, tiedA] },
        scoring,
        source: { type: 'greenhouse', tags: [] },
        evaluationTime: '2026-07-30T12:00:00.000Z',
      }).selectedTrackId,
    ).toBe('a-track');
  });
});

describe('diversity selector', () => {
  it('applies quotas, status exclusions, company/title caps, fallback, and stable ordering', () => {
    const candidates = [
      selected('b', 'track-b', 96, 'Beta', 'Data Engineer'),
      selected('a', 'data-engineering', 95, 'Acme', 'Data Engineer'),
      selected('c', 'data-engineering', 94, 'Acme', 'ML Engineer'),
      selected('d', 'data-engineering', 93, 'Acme', 'Platform Engineer'),
      selected('e', 'data-engineering', 92, 'Echo', 'Data Engineer', 'APPLIED'),
      selected(
        'f',
        'data-engineering',
        91,
        'Foxtrot',
        'Data Engineer',
        'SKIPPED',
      ),
    ];
    const input = {
      candidates: [...candidates].reverse(),
      limit: 4,
      minimumScore: 55,
      maximumPerCompany: 2,
      maximumSameTitle: 2,
      unknownCompanyJobsShareCap: false,
      quotas: [
        { trackId: 'data-engineering', count: 2 },
        { trackId: 'track-b', count: 1 },
      ],
    } as const;
    const first = selectDiverseRecommendations(input);
    expect(selectDiverseRecommendations({ ...input, candidates })).toEqual(
      first,
    );
    expect(first.map((item) => item.jobId)).toEqual(['a', 'c', 'b']);
    expect(first.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it('rejects invalid limits and returns an empty valid result', () => {
    expect(() =>
      selectDiverseRecommendations({
        candidates: [],
        limit: 0,
        minimumScore: 0,
        maximumPerCompany: 1,
        maximumSameTitle: 1,
        unknownCompanyJobsShareCap: false,
        quotas: [],
      }),
    ).toThrow('positive integer');
    expect(
      selectDiverseRecommendations({
        candidates: [],
        limit: 1,
        minimumScore: 55,
        maximumPerCompany: 1,
        maximumSameTitle: 1,
        unknownCompanyJobsShareCap: false,
        quotas: [],
      }),
    ).toEqual([]);
  });

  it('handles 5000 candidates deterministically without pairwise comparison', () => {
    const candidates = Array.from({ length: 5_000 }, (_, index) =>
      selected(
        `job-${String(index).padStart(4, '0')}`,
        'data-engineering',
        80,
        `Company ${index % 100}`,
        `Title ${index % 20}`,
      ),
    );
    const result = selectDiverseRecommendations({
      candidates,
      limit: 20,
      minimumScore: 55,
      maximumPerCompany: 2,
      maximumSameTitle: 2,
      unknownCompanyJobsShareCap: false,
      quotas: [],
    });
    expect(result).toHaveLength(20);
    expect(result[0]?.jobId).toBe('job-0000');
  });
});

function score(
  changedJob: EnrichedNormalizedJob,
  changedTrack: SearchTrack,
  source: ScoringSourceContext = { type: 'greenhouse', tags: [] },
) {
  return scoreJobAgainstTrack({
    job: changedJob,
    candidate,
    track: changedTrack,
    search,
    scoring,
    source,
    evaluationTime: '2026-07-30T12:00:00.000Z',
  });
}

function component(result: ReturnType<typeof score>, key: string) {
  const found = result.components.find((item) => item.key === key);
  if (found === undefined) throw new Error(`Missing component ${key}.`);
  return found;
}

function job(
  overrides: Partial<EnrichedNormalizedJob> = {},
): EnrichedNormalizedJob {
  return {
    id: 'job-a',
    inputRevisionNumber: 1,
    sourceId: 'source-a',
    externalId: 'external-a',
    sourceUrl: 'https://jobs.example.test/a',
    applicationUrl: 'https://boards.greenhouse.io/example/jobs/a',
    canonicalApplicationUrl: 'https://boards.greenhouse.io/example/jobs/a',
    originalTitle: 'Data Engineer',
    cleanedTitle: 'Data Engineer',
    normalizedTitle: 'Data Engineer',
    titleComparisonKey: 'data engineer',
    originalCompany: 'Example GmbH',
    normalizedCompany: 'Example GmbH',
    companyComparisonKey: 'example',
    location: {
      countryCode: 'DE',
      countryCodes: ['DE'],
      remotePolicy: 'hybrid',
      remoteScope: 'UNSPECIFIED',
      normalizedKey: 'hybrid|unspecified|de::berlin',
    },
    employmentType: 'full-time',
    industry: 'Software',
    experienceRequirements: [experience(3)],
    educationRequirements: [
      {
        level: 'bachelor',
        requirement: 'REQUIRED',
        acceptsEquivalentExperience: false,
        evidence: 'Bachelor required.',
      },
    ],
    languageRequirements: [
      {
        code: 'en',
        name: 'English',
        proficiency: 'professional',
        requirement: 'REQUIRED',
        nativeRequired: false,
        evidence: 'English required.',
      },
    ],
    skillRequirements: [
      skill('PostgreSQL', 'REQUIRED'),
      skill('TypeScript', 'PREFERRED'),
    ],
    workAuthorizationRequirements: [
      {
        countryCode: 'DE',
        sponsorshipAvailable: false,
        citizenshipOnly: false,
        securityClearanceRequired: false,
        evidence: 'Right to work in Germany required.',
      },
    ],
    description: 'Build data platform pipelines.',
    salary: {
      minimumAmount: 90_000,
      maximumAmount: 110_000,
      currency: 'EUR',
      period: 'YEAR',
      grossNet: 'GROSS',
      kind: 'RANGE',
      parsingStatus: 'STRUCTURED',
    },
    publishedAt: '2026-07-29T12:00:00.000Z',
    firstSeenAt: '2026-07-29T12:00:00.000Z',
    lastCollectedAt: '2026-07-30T10:00:00.000Z',
    normalizationVersion: 'normalization-v1',
    normalizedAt: '2026-07-30T10:00:00.000Z',
    ...overrides,
  };
}

function skill(name: string, requirement: 'REQUIRED' | 'PREFERRED') {
  return {
    canonicalName: name,
    originalSpelling: name,
    requirement,
    evidence: `${name} ${requirement}.`,
  } as const;
}

function experience(minimumYears: number) {
  return {
    minimumYears,
    level: 'REQUIRED',
    evidence: `${minimumYears} years required.`,
  } as const;
}

function selected(
  jobId: string,
  trackId: string,
  totalScore: number,
  company: string,
  title: string,
  currentStatus: 'NEW' | 'APPLIED' | 'SKIPPED' = 'NEW',
) {
  const base = scoreJobAgainstTrack({
    job: job({ id: jobId }),
    candidate,
    track: { ...track, id: trackId },
    search,
    scoring,
    source: { type: 'greenhouse', tags: [] },
    evaluationTime: '2026-07-30T12:00:00.000Z',
  });
  return {
    jobId,
    normalizedCompany: company,
    normalizedTitle: title,
    currentStatus,
    score: {
      ...base,
      selectedTrackId: trackId,
      totalScore,
      opportunityScore: totalScore,
    },
  };
}
