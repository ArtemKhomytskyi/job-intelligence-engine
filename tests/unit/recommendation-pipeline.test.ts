import { describe, expect, it } from 'vitest';

import {
  CreateRecommendations,
  type PersistedRecommendationBatch,
  type RecommendationBatchRepository,
  type RecommendationBatchWrite,
  type RecommendationCandidateRecord,
} from '../../src/application/index.js';
import {
  createPercentage,
  type EnrichedNormalizedJob,
} from '../../src/domain/index.js';

const clock = { now: () => new Date('2026-07-30T12:00:00.000Z') };
const hasher = { sha256: (value: string) => `hash:${value.length}:${value}` };

describe('recommendation application pipeline', () => {
  it('scores eligible jobs, excludes terminal statuses, selects ranks, and reuses identical batches', async () => {
    const repository = new MemoryRecommendationRepository([
      record('eligible-a', 'NEW'),
      record('eligible-b', 'NEW'),
      record('applied', 'APPLIED'),
      record('skipped', 'SKIPPED'),
    ]);
    const service = new CreateRecommendations(repository, clock, hasher);
    const first = await service.execute(input());
    const second = await service.execute(input());
    expect(first.items.map((item) => item.jobId)).toEqual([
      'eligible-a',
      'eligible-b',
    ]);
    expect(first.items.map((item) => item.rank)).toEqual([1, 2]);
    expect(
      first.items.every((item) => item.score.selectedTrackId === 'data'),
    ).toBe(true);
    expect(second).toMatchObject({ id: first.id, reused: true });
    expect(repository.writes).toHaveLength(1);
  });

  it('persists a valid empty batch and propagates persistence failures', async () => {
    const empty = new MemoryRecommendationRepository([]);
    await expect(
      new CreateRecommendations(empty, clock, hasher).execute(input()),
    ).resolves.toMatchObject({ selectedCount: 0, items: [] });
    empty.failSave = true;
    await expect(
      new CreateRecommendations(empty, clock, hasher).execute(input()),
    ).rejects.toThrow('synthetic persistence failure');
  });

  it('honors source track restrictions when choosing relevant tracks', async () => {
    const repository = new MemoryRecommendationRepository([
      record('restricted', 'NEW'),
    ]);
    const restrictedInput = input();
    const result = await new CreateRecommendations(
      repository,
      clock,
      hasher,
    ).execute({
      ...restrictedInput,
      sources: restrictedInput.sources.map((source) => ({
        ...source,
        trackIds: ['other'],
      })),
    });

    expect(result.items[0]?.score.selectedTrackId).toBe('other');
  });

  it('rejects invalid limits before repository access', async () => {
    const repository = new MemoryRecommendationRepository([]);
    await expect(
      new CreateRecommendations(repository, clock, hasher).execute({
        ...input(),
        limit: 0,
      }),
    ).rejects.toThrow('integer from 1 through 1000');
    expect(repository.listCalls).toBe(0);
  });
});

class MemoryRecommendationRepository implements RecommendationBatchRepository {
  public readonly writes: RecommendationBatchWrite[] = [];
  public listCalls = 0;
  public failSave = false;
  private readonly batches = new Map<string, PersistedRecommendationBatch>();
  public constructor(
    private readonly candidates: readonly RecommendationCandidateRecord[],
  ) {}
  public listEligibleCandidates(limit: number) {
    this.listCalls += 1;
    return Promise.resolve(this.candidates.slice(0, limit));
  }
  public saveBatch(input: RecommendationBatchWrite) {
    if (this.failSave)
      return Promise.reject(new Error('synthetic persistence failure'));
    const existing = this.batches.get(input.inputHash);
    if (existing !== undefined)
      return Promise.resolve({ ...existing, reused: true });
    this.writes.push(input);
    const batch: PersistedRecommendationBatch = {
      id: `batch-${this.batches.size + 1}`,
      inputHash: input.inputHash,
      evaluationTime: input.evaluationTime,
      requestedLimit: input.requestedLimit,
      selectedCount: input.items.length,
      configurationFingerprint: input.configurationFingerprint,
      scoringVersion: input.scoringVersion,
      selectorVersion: input.selectorVersion,
      createdAt: input.evaluationTime,
      reused: false,
      items: input.items.map((item) => ({
        ...item,
        scoreId: `score-${item.jobId}`,
        title: 'Data Engineer',
        company: 'Synthetic Labs',
      })),
    };
    this.batches.set(input.inputHash, batch);
    return Promise.resolve(batch);
  }
}

function input() {
  return {
    limit: 20,
    candidate: {
      id: 'candidate',
      displayName: 'Synthetic',
      professionalExperienceSummary: 'Synthetic.',
      totalYearsExperience: 4,
      education: [],
      skills: [{ name: 'TypeScript' }],
      languages: [],
      citizenships: ['DE'],
      workAuthorizations: [{ country: 'DE', status: 'citizen' as const }],
      preferredEmploymentTypes: ['full-time' as const],
      location: {
        country: 'DE',
        willingToRelocate: false,
        relocationCountries: [],
      },
    },
    search: {
      tracks: [
        {
          id: 'other',
          displayName: 'Other',
          enabled: true,
          targetTitles: ['Sales Manager'],
          includeKeywords: [],
          excludeKeywords: [],
          preferredSkills: [],
          preferredIndustries: [],
          priority: 2,
        },
        {
          id: 'data',
          displayName: 'Data',
          enabled: true,
          targetTitles: ['Data Engineer'],
          includeKeywords: ['pipelines'],
          excludeKeywords: [],
          preferredSkills: ['TypeScript'],
          preferredIndustries: [],
          priority: 1,
          recommendationQuota: 2,
        },
      ],
      preferences: {
        preferredCountries: ['DE'],
        allowedRemotePolicies: ['remote' as const],
        willingToRelocate: false,
        relocationCountries: [],
        preferredCompanySizes: [],
        allowedEmploymentTypes: ['full-time' as const],
        excludedSeniorityLevels: [],
        excludedCompanies: [],
        excludedIndustries: [],
        requiredExperience: { minimumYears: 0 },
        dailyRecommendationLimit: 20,
        minimumAcceptableScore: createPercentage(0),
        maximumRecommendationsPerCompany: 2,
        hardFilters: {
          allowedCountries: [],
          allowedCountryGroups: [],
          rejectUnknownLocation: false,
          unknownCandidateLanguageLevelPolicy: 'allow' as const,
          maximumSeniority: 'executive' as const,
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
    },
    scoring: {
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
        titleAliases: [],
        skillAliases: [],
        experienceToleranceYears: 1,
        freshnessFullScoreDays: 3,
        freshnessHorizonDays: 60,
        sourceQuality: { greenhouse: 90 },
        selector: { maximumSameTitle: 3, unknownCompanyJobsShareCap: false },
      },
    },
    sources: [
      {
        id: 'source-a',
        type: 'greenhouse' as const,
        enabled: true,
        displayName: 'Source A',
        tags: [],
        trackIds: [],
        settings: { boardToken: 'synthetic' },
      },
    ],
    signal: new AbortController().signal,
  } as const;
}

function record(
  jobId: string,
  currentStatus: 'NEW' | 'APPLIED' | 'SKIPPED',
): RecommendationCandidateRecord {
  return {
    jobId,
    processingDecisionId: `decision-${jobId}`,
    inputRevisionNumber: 1,
    currentStatus,
    normalizedJob: normalizedJob(jobId),
    sourceIds: ['source-a'],
    source: { type: 'greenhouse', tags: [], trackIds: [] },
  };
}

function normalizedJob(id: string): EnrichedNormalizedJob {
  return {
    id,
    inputRevisionNumber: 1,
    sourceUrl: `https://jobs.example.test/${id}`,
    applicationUrl: `https://apply.example.test/${id}`,
    canonicalApplicationUrl: `https://apply.example.test/${id}`,
    originalTitle: 'Data Engineer',
    cleanedTitle: 'Data Engineer',
    normalizedTitle: 'Data Engineer',
    titleComparisonKey: 'data engineer',
    originalCompany: 'Synthetic Labs',
    normalizedCompany: 'Synthetic Labs',
    companyComparisonKey: 'synthetic labs',
    location: {
      countryCode: 'DE',
      countryCodes: ['DE'],
      remotePolicy: 'remote',
      remoteScope: 'COUNTRY',
      normalizedKey: 'remote|country|de',
    },
    employmentType: 'full-time',
    experienceRequirements: [],
    educationRequirements: [],
    languageRequirements: [],
    skillRequirements: [
      {
        canonicalName: 'TypeScript',
        originalSpelling: 'TypeScript',
        requirement: 'REQUIRED',
        evidence: 'TypeScript required.',
      },
    ],
    workAuthorizationRequirements: [],
    description: 'Build pipelines.',
    publishedAt: '2026-07-30T10:00:00.000Z',
    firstSeenAt: '2026-07-30T10:00:00.000Z',
    lastCollectedAt: '2026-07-30T11:00:00.000Z',
    normalizationVersion: 'normalization-v2',
    normalizedAt: '2026-07-30T11:00:00.000Z',
  };
}
