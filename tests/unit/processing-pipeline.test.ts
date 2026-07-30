import { describe, expect, it } from 'vitest';

import {
  ProcessCollectedJobs,
  createProcessingConfigFingerprint,
  MAX_POSSIBLE_DUPLICATE_CANDIDATES,
  type Clock,
  type Logger,
  type ProcessingDecisionKey,
  type ProcessingDecisionLookup,
  type ProcessingDecisionWrite,
  type ProcessingRepository,
  type ProcessingRunCompletion,
  type ProcessingRunWrite,
  type ProcessableJob,
} from '../../src/application/index.js';
import type {
  CandidateProfile,
  HardFilterConfiguration,
} from '../../src/domain/index.js';

const clock: Clock = { now: () => new Date('2026-07-29T12:00:00.000Z') };
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const hasher = { sha256: (value: string) => `sha256:${value}` };
const candidate: CandidateProfile = {
  id: 'synthetic',
  displayName: 'Synthetic',
  education: [],
  professionalExperienceSummary: 'Synthetic.',
  skills: [],
  languages: [],
  citizenships: ['DE'],
  workAuthorizations: [{ country: 'DE', status: 'citizen' }],
  preferredEmploymentTypes: ['full-time'],
  location: {
    country: 'DE',
    willingToRelocate: false,
    relocationCountries: [],
  },
};
const filters: HardFilterConfiguration = {
  allowedCountries: ['DE'],
  allowedCountryGroups: ['EU'],
  rejectUnknownLocation: false,
  unknownCandidateLanguageLevelPolicy: 'allow',
  maximumSeniority: 'mid',
  maximumRequiredExperienceYears: 3,
  allowMandatoryPhd: false,
  excludedCompanies: [],
  excludedIndustries: [],
  excludedTitlePhrases: [],
  rejectUnknownIndustry: false,
  removableTrackingParameters: ['utm_source'],
  companyLegalSuffixes: ['GmbH'],
};

describe('processing pipeline', () => {
  it('persists unique, confirmed duplicate, and possible duplicate outcomes deterministically', async () => {
    const repository = new MemoryProcessingRepository([
      job('a', 'https://apply.example.test/shared', '2026-07-01T00:00:00Z'),
      job('b', 'https://apply.example.test/shared', '2026-07-02T00:00:00Z'),
      job('c', 'https://apply.example.test/c', '2026-07-03T00:00:00Z'),
    ]);
    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 100,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(summary).toMatchObject({
      consideredCount: 3,
      duplicateCount: 1,
      possibleDuplicateCount: 1,
      eligibleCount: 1,
      errorCount: 0,
    });
    expect(repository.decisions.map((item) => item.processingStatus)).toEqual([
      'ELIGIBLE',
      'DUPLICATE',
      'POSSIBLE_DUPLICATE',
    ]);
    expect(repository.decisions[1]?.duplicateDecision).toMatchObject({
      decision: 'DUPLICATE',
      primaryJobId: 'a',
    });
  });

  it('uses source identity defensively and isolates a failed normalization', async () => {
    const repository = new MemoryProcessingRepository([
      job('a'),
      {
        ...job('b', 'https://apply.example.test/b'),
        externalId: 'a',
      },
      { ...job('invalid'), title: '   ' },
    ]);
    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(summary).toMatchObject({
      eligibleCount: 1,
      duplicateCount: 1,
      normalizationFailedCount: 1,
      errorCount: 0,
    });
    expect(repository.decisions[1]?.duplicateDecision).toMatchObject({
      decision: 'DUPLICATE',
      primaryJobId: 'a',
    });
    expect(repository.decisions[2]?.processingStatus).toBe(
      'NORMALIZATION_FAILED',
    );
  });

  it('is idempotent and reprocesses changed configuration and revisions', async () => {
    const repository = new MemoryProcessingRepository([job('a')]);
    let hashCalls = 0;
    const countingHasher = {
      sha256: (value: string) => {
        hashCalls += 1;
        return `sha256:${value}`;
      },
    };
    const processor = new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      countingHasher,
    );
    const input = {
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    } as const;
    await processor.execute(input);
    expect(repository.decisions[0]?.processingFingerprint).toMatch(/^sha256:/u);
    expect(hashCalls).toBe(3);
    const repeated = await processor.execute(input);
    expect(repeated.skippedCount).toBe(1);
    expect(repository.decisions).toHaveLength(1);
    expect(hashCalls).toBe(4);
    await processor.execute({
      ...input,
      hardFilters: { ...filters, maximumRequiredExperienceYears: 4 },
    });
    expect(repository.decisions).toHaveLength(2);
    expect(repository.decisions[1]?.processingFingerprint).toBe(
      repository.decisions[0]?.processingFingerprint,
    );
    repository.setJobs([{ ...job('a'), inputRevisionNumber: 1 }]);
    await processor.execute(input);
    expect(repository.decisions).toHaveLength(3);
  });

  it('fingerprints only relevant configuration with set-like ordering', () => {
    const first = createProcessingConfigFingerprint(
      candidate,
      { ...filters, allowedCountries: ['DE', 'NL'] },
      hasher,
    );
    const reordered = createProcessingConfigFingerprint(
      {
        ...candidate,
        displayName: 'Irrelevant display change',
        citizenships: [...candidate.citizenships].reverse(),
      },
      { ...filters, allowedCountries: ['NL', 'DE'] },
      hasher,
    );
    expect(reordered).toBe(first);
    expect(
      createProcessingConfigFingerprint(
        candidate,
        { ...filters, maximumRequiredExperienceYears: 4 },
        hasher,
      ),
    ).not.toBe(first);
    expect(
      createProcessingConfigFingerprint(
        {
          ...candidate,
          education: [
            { level: 'bachelor', field: 'Computer Science', institution: 'A' },
          ],
          languages: [
            { code: 'de', name: 'German', proficiency: 'native' },
            { code: 'en', name: 'English', proficiency: 'professional' },
          ],
          workAuthorizations: [
            { country: 'NL', status: 'authorized' },
            { country: 'DE', status: 'citizen' },
          ],
        },
        filters,
        hasher,
      ),
    ).toMatch(/^sha256:/u);
  });

  it('processes a bounded batch of 1000 records with deterministic counts', async () => {
    let hashCalls = 0;
    const countingHasher = {
      sha256: (value: string) => {
        hashCalls += 1;
        return `sha256:${value}`;
      },
    };
    const repository = new MemoryProcessingRepository(
      Array.from({ length: 1_000 }, (_, index) =>
        job(
          `job-${String(index).padStart(4, '0')}`,
          `https://apply.example.test/${index}`,
        ),
      ),
    );
    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      countingHasher,
    ).execute({
      limit: 1_000,
      initiatedBy: 'performance-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(summary).toMatchObject({
      consideredCount: 1_000,
      normalizedCount: 1_000,
      eligibleCount: 1,
      possibleDuplicateCount: 999,
      errorCount: 0,
    });
    expect(repository.decisionLookupCount).toBe(1);
    expect(hashCalls).toBe(2_001);
  });

  it('retains bounded weak evidence in stable primary order', async () => {
    const candidates = Array.from(
      { length: MAX_POSSIBLE_DUPLICATE_CANDIDATES + 5 },
      (_, index) =>
        job(
          `candidate-${String(index).padStart(2, '0')}`,
          `https://apply.example.test/candidate-${index}`,
          `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
        ),
    ).reverse();
    const repository = new MemoryProcessingRepository(candidates);
    await new ProcessCollectedJobs(repository, clock, logger, hasher).execute({
      limit: 100,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    const latest = repository.decisions.find(
      (decision) => decision.jobId === 'candidate-24',
    );
    expect(latest?.duplicateDecision).toMatchObject({
      decision: 'POSSIBLE_DUPLICATE',
      candidateJobIds: Array.from(
        { length: MAX_POSSIBLE_DUPLICATE_CANDIDATES },
        (_, index) => `candidate-${String(index).padStart(2, '0')}`,
      ),
    });
    if (latest?.duplicateDecision?.decision === 'POSSIBLE_DUPLICATE') {
      expect(
        new Set(
          latest.duplicateDecision.evidence.map((item) => item.matchedJobId),
        ),
      ).toEqual(new Set(latest.duplicateDecision.candidateJobIds));
    }
  });

  it('confirms substantive stable fingerprints without merging distinct departments', async () => {
    const description = 'You must have 2 years of TypeScript experience.';
    const repository = new MemoryProcessingRepository([
      { ...job('b'), description, metadata: { department: 'Data' } },
      { ...job('a'), description, metadata: { department: 'Data' } },
      { ...job('c'), description, metadata: { department: 'Security' } },
    ]);

    await new ProcessCollectedJobs(repository, clock, logger, hasher).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });

    expect(
      repository.decisions.find((item) => item.jobId === 'b'),
    ).toMatchObject({
      processingStatus: 'DUPLICATE',
      duplicateDecision: {
        decision: 'DUPLICATE',
        primaryJobId: 'a',
        evidence: [{ layer: 'STABLE_FINGERPRINT' }],
      },
    });
    expect(
      repository.decisions.find((item) => item.jobId === 'c'),
    ).toMatchObject({
      processingStatus: 'POSSIBLE_DUPLICATE',
      duplicateDecision: { decision: 'POSSIBLE_DUPLICATE' },
    });
  });

  it('records cancellation as a terminal cancelled run', async () => {
    const controller = new AbortController();
    controller.abort();
    const repository = new MemoryProcessingRepository([job('a')]);

    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: controller.signal,
    });

    expect(summary.status).toBe('CANCELLED');
    expect(repository.completions).toMatchObject([
      { status: 'CANCELLED', consideredCount: 1, normalizedCount: 0 },
    ]);
  });

  it('marks a created run failed when run-level processing fails', async () => {
    const repository = new MemoryProcessingRepository([job('a')]);
    repository.failListing = true;

    await expect(
      new ProcessCollectedJobs(repository, clock, logger, hasher).execute({
        limit: 10,
        initiatedBy: 'unit-test',
        candidate,
        hardFilters: filters,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('synthetic listing failure');
    expect(repository.completions).toMatchObject([
      { status: 'FAILED', consideredCount: 0 },
    ]);
  });

  it('isolates a per-job exception and persists a safe error decision', async () => {
    const repository = new MemoryProcessingRepository([job('a'), job('b')]);
    repository.failNextDecisionSave = true;

    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });

    expect(summary).toMatchObject({
      status: 'PARTIALLY_FAILED',
      errorCount: 1,
      normalizedCount: 1,
    });
    expect(repository.decisions[0]).toMatchObject({
      jobId: 'a',
      processingStatus: 'ERROR',
      errorCode: 'Error',
      errorMessage: 'Job processing failed. See structured diagnostics.',
    });
  });

  it('treats concurrent decision inserts as skipped for successful and failed normalization', async () => {
    const successfulRepository = new MemoryProcessingRepository([job('a')]);
    successfulRepository.alreadyExistsNextDecision = true;
    const successful = await new ProcessCollectedJobs(
      successfulRepository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(successful).toMatchObject({
      normalizedCount: 0,
      skippedCount: 1,
    });

    const failedRepository = new MemoryProcessingRepository([
      { ...job('invalid'), title: ' ' },
    ]);
    failedRepository.alreadyExistsNextDecision = true;
    const failed = await new ProcessCollectedJobs(
      failedRepository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(failed).toMatchObject({
      normalizationFailedCount: 0,
      skippedCount: 1,
    });
  });

  it('persists a rejected pipeline outcome separately from eligibility', async () => {
    const repository = new MemoryProcessingRepository([
      { ...job('senior'), title: 'Senior Data Engineer' },
    ]);
    const summary = await new ProcessCollectedJobs(
      repository,
      clock,
      logger,
      hasher,
    ).execute({
      limit: 10,
      initiatedBy: 'unit-test',
      candidate,
      hardFilters: filters,
      signal: new AbortController().signal,
    });
    expect(summary).toMatchObject({ rejectedCount: 1, eligibleCount: 0 });
    expect(repository.decisions[0]).toMatchObject({
      processingStatus: 'REJECTED',
      hardFilterResult: {
        decision: 'REJECTED',
        reasons: [{ code: 'SENIORITY_EXCEEDS_MAXIMUM' }],
      },
    });
  });

  it('preserves a run error when recording terminal failure also fails', async () => {
    const repository = new MemoryProcessingRepository([job('a')]);
    repository.failListing = true;
    repository.failCompletion = true;

    await expect(
      new ProcessCollectedJobs(repository, clock, logger, hasher).execute({
        limit: 10,
        initiatedBy: 'unit-test',
        candidate,
        hardFilters: filters,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('synthetic listing failure');
  });
});

class MemoryProcessingRepository implements ProcessingRepository {
  public readonly decisions: ProcessingDecisionWrite[] = [];
  public readonly completions: ProcessingRunCompletion[] = [];
  public decisionLookupCount = 0;
  public failListing = false;
  public failNextDecisionSave = false;
  public alreadyExistsNextDecision = false;
  public failCompletion = false;
  private readonly keys = new Set<string>();
  public constructor(private jobs: readonly ProcessableJob[]) {}
  public setJobs(jobs: readonly ProcessableJob[]): void {
    this.jobs = jobs;
  }
  public listProcessableJobs(limit: number) {
    if (this.failListing)
      return Promise.reject(new Error('synthetic listing failure'));
    return Promise.resolve(this.jobs.slice(0, limit));
  }
  public createRun(input: ProcessingRunWrite) {
    return Promise.resolve({ ...input, id: `run-${this.decisions.length}` });
  }
  public listExistingDecisionKeys(input: ProcessingDecisionLookup) {
    this.decisionLookupCount += 1;
    return Promise.resolve(
      this.decisions.filter(
        (decision) =>
          input.jobIds.includes(decision.jobId) &&
          decision.normalizationVersion === input.normalizationVersion &&
          decision.fingerprintVersion === input.fingerprintVersion &&
          decision.filterRulesVersion === input.filterRulesVersion &&
          decision.configFingerprint === input.configFingerprint,
      ),
    );
  }
  public saveDecision(input: ProcessingDecisionWrite) {
    if (this.failNextDecisionSave) {
      this.failNextDecisionSave = false;
      return Promise.reject(new Error('synthetic decision failure'));
    }
    if (this.alreadyExistsNextDecision) {
      this.alreadyExistsNextDecision = false;
      return Promise.resolve('ALREADY_EXISTS' as const);
    }
    if (this.keys.has(key(input)))
      return Promise.resolve('ALREADY_EXISTS' as const);
    this.keys.add(key(input));
    this.decisions.push(input);
    return Promise.resolve('CREATED' as const);
  }
  public completeRun(input: ProcessingRunCompletion) {
    if (this.failCompletion)
      return Promise.reject(new Error('synthetic completion failure'));
    this.completions.push(input);
    return Promise.resolve();
  }
}

function key(input: ProcessingDecisionKey): string {
  return [
    input.jobId,
    input.inputRevisionNumber,
    input.normalizationVersion,
    input.fingerprintVersion,
    input.filterRulesVersion,
    input.configFingerprint,
  ].join('|');
}

function job(
  id: string,
  applicationUrl = `https://apply.example.test/${id}`,
  firstSeenAt = '2026-07-01T00:00:00Z',
): ProcessableJob {
  return {
    id,
    sourceId: 'source-a',
    externalId: id,
    sourceUrl: `https://jobs.example.test/${id}`,
    canonicalUrl: `https://jobs.example.test/${id}`,
    applicationUrl,
    title: 'Data Engineer',
    company: 'Example GmbH',
    locations: [{ country: 'DE', city: 'Berlin' }],
    firstSeenAt,
    lastCollectedAt: '2026-07-29T10:00:00Z',
    inputRevisionNumber: 0,
  };
}
