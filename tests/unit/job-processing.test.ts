import { describe, expect, it } from 'vitest';

import {
  evaluateHardFilters,
  normalizeIdentityUrl,
  normalizeJobForProcessing,
  type CandidateProfile,
  type HardFilterConfiguration,
  type ProcessableJob,
} from '../../src/domain/index.js';
import { goldenProcessingCases } from '../fixtures/processing/golden-cases.js';

const filters: HardFilterConfiguration = {
  allowedCountries: ['DE', 'NL'],
  allowedCountryGroups: ['EU', 'EEA'],
  rejectUnknownLocation: false,
  unknownCandidateLanguageLevelPolicy: 'reject',
  maximumSeniority: 'mid',
  maximumRequiredExperienceYears: 3,
  allowMandatoryPhd: false,
  excludedCompanies: ['Blocked GmbH'],
  excludedIndustries: ['Gambling'],
  excludedTitlePhrases: ['Sales'],
  rejectUnknownIndustry: false,
  removableTrackingParameters: ['utm_source', 'utm_campaign'],
  companyLegalSuffixes: ['GmbH', 'Inc', 'Ltd'],
};

const candidate: CandidateProfile = {
  id: 'candidate',
  displayName: 'Synthetic Candidate',
  education: [{ level: 'master', field: 'Computing' }],
  professionalExperienceSummary: 'Synthetic experience.',
  skills: [],
  languages: [
    { code: 'en', name: 'English', proficiency: 'fluent' },
    { code: 'de', name: 'German', proficiency: 'basic' },
  ],
  citizenships: ['DE'],
  workAuthorizations: [{ country: 'DE', status: 'citizen' }],
  preferredEmploymentTypes: ['full-time'],
  location: {
    country: 'DE',
    willingToRelocate: false,
    relocationCountries: [],
  },
};

describe('processing normalization', () => {
  it.each(goldenProcessingCases)(
    'matches golden case: $name',
    ({ input, expected }) => {
      const result = normalizeJobForProcessing(
        job(input),
        filters,
        '2026-07-29T12:00:00.000Z',
      );
      expect(result.status).toBe('SUCCESS');
      if (result.status !== 'SUCCESS') return;
      const actual = {
        title: result.job.normalizedTitle,
        seniority: result.job.seniority,
        scope: result.job.location.remoteScope,
        country: result.job.location.countryCode,
        remotePolicy: result.job.location.remotePolicy,
        cityText: result.job.location.originalText,
        employmentType: result.job.employmentType,
        language: result.job.languageRequirements[0]?.code,
        languageRequirement: result.job.languageRequirements[0]?.requirement,
        education: result.job.educationRequirements[0]?.level,
        educationRequirement: result.job.educationRequirements[0]?.requirement,
        salaryMinimum: result.job.salary?.minimumAmount,
        salaryMaximum: result.job.salary?.maximumAmount,
        salaryPeriod: result.job.salary?.period,
        salaryStatus: result.job.salary?.parsingStatus,
        salaryIssue: result.issues.some(
          (issue) => issue.code === 'UNPARSEABLE_SALARY',
        ),
        externalId: result.job.externalId,
        canonicalUrl: result.job.canonicalApplicationUrl,
        expiresAt: result.job.expiresAt,
      };
      expect(actual).toMatchObject(expected);
    },
  );

  it('normalizes identity, title, company, restricted remote location, and explicit requirements', () => {
    const result = normalizeJobForProcessing(
      job({
        title: 'Senior Machine Learning Engineer, Platform',
        company: 'Example GmbH',
        applicationUrl:
          'https://JOBS.example.test:443/apply/one/?utm_source=test&job=1#form',
        description:
          'Required: 5+ years of experience. German C1 is required. PhD preferred. PostgreSQL and NodeJS required.',
        metadata: { locationText: 'Remote within the EU' },
        remotePolicy: 'remote',
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.job).toMatchObject({
      normalizedTitle: 'Machine Learning Engineer, Platform',
      seniority: 'senior',
      companyComparisonKey: 'example',
      canonicalApplicationUrl: 'https://jobs.example.test/apply/one?job=1',
      location: { remotePolicy: 'remote', remoteScope: 'EU' },
    });
    expect(result.job.experienceRequirements[0]).toMatchObject({
      minimumYears: 5,
      level: 'REQUIRED',
    });
    expect(result.job.languageRequirements[0]).toMatchObject({
      code: 'de',
      proficiency: 'professional',
      requirement: 'REQUIRED',
    });
    expect(result.job.educationRequirements[0]).toMatchObject({
      level: 'doctorate',
      requirement: 'PREFERRED',
    });
    expect(
      result.job.skillRequirements.map((item) => item.canonicalName),
    ).toEqual(['Node.js', 'PostgreSQL']);
  });

  it.each([
    ['Lead Generation Specialist', undefined],
    ['Account Executive', undefined],
    ['Executive Assistant', undefined],
    ['Director of Photography', undefined],
    ['Principal Data Scientist', 'principal'],
    ['Managing Director', 'director'],
  ] as const)('avoids title false positives for %s', (title, seniority) => {
    const result = normalizeJobForProcessing(
      job({ title }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS')
      expect(result.job.seniority).toBe(seniority);
  });

  it('matches boundary-aware skills and preserves remote country restrictions', () => {
    const result = normalizeJobForProcessing(
      job({
        description:
          'Required experience with Rust and R. Python is preferred.',
        metadata: { locationText: 'Remote — US only' },
        remotePolicy: 'remote',
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(
      result.job.skillRequirements.map((item) => item.canonicalName),
    ).toEqual(['Rust', 'R', 'Python']);
    expect(result.job.location).toMatchObject({
      countryCode: 'US',
      remoteScope: 'COUNTRY',
    });
  });

  it('normalizes only configured tracking parameters and rejects invalid identity URLs', () => {
    expect(
      normalizeIdentityUrl(
        'https://EXAMPLE.test:443/jobs/One/?utm_source=x&id=7#top',
        ['utm_source'],
      ),
    ).toBe('https://example.test/jobs/One?id=7');
    expect(normalizeIdentityUrl('file:///jobs/one', [])).toBeUndefined();
    expect(
      normalizeIdentityUrl('https://user:secret@example.test/jobs', []),
    ).toBeUndefined();
  });

  it.each([
    ['Remote worldwide', 'remote', 'WORLDWIDE'],
    ['Remote across the EEA', 'remote', 'EEA'],
    ['Remote in Europe', 'remote', 'EUROPE'],
    ['Remote UTC+2 timezone', 'remote', 'TIMEZONE'],
    ['Hybrid - Milan', 'hybrid', 'UNSPECIFIED'],
  ] as const)(
    'normalizes geographic scope for %s',
    (locationText, policy, scope) => {
      const result = normalizeJobForProcessing(
        job({ metadata: { locationText }, remotePolicy: policy }),
        filters,
        '2026-07-29T12:00:00.000Z',
      );
      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS')
        expect(result.job.location.remoteScope).toBe(scope);
    },
  );

  it.each([
    ['Staff Engineer', 'staff'],
    ['VP of Engineering', 'vp'],
    ['Chief Technology Officer', 'executive'],
    ['Engineering Lead', 'lead'],
    ['Engineering Manager', 'manager'],
    ['Junior Engineer', 'entry'],
    ['Engineering Intern', 'intern'],
  ] as const)('detects and removes %s seniority', (title, seniority) => {
    const result = normalizeJobForProcessing(
      job({ title }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.job.seniority).toBe(seniority);
      expect(result.job.normalizedTitle).not.toBe(title);
    }
  });

  it('parses ranges, alternatives, language levels, authorization, and aliases', () => {
    const result = normalizeJobForProcessing(
      job({
        description: [
          'Two to four years preferred.',
          '2-4 years of experience preferred.',
          "A bachelor's degree or equivalent work experience is required.",
          'Native English required; French B2 preferred; Spanish A2 optional.',
          'Must have the right to work in the EU and security clearance is required.',
          'Postgres, Node.js, TypeScript, JavaScript, Python, and SQL are required.',
        ].join(' '),
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.job.experienceRequirements[0]).toMatchObject({
      minimumYears: 2,
      maximumYears: 4,
      level: 'PREFERRED',
    });
    expect(result.job.educationRequirements[0]).toMatchObject({
      level: 'bachelor',
      acceptsEquivalentExperience: true,
    });
    expect(result.job.languageRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'en', proficiency: 'native' }),
        expect.objectContaining({ code: 'fr', proficiency: 'conversational' }),
        expect.objectContaining({ code: 'es', proficiency: 'basic' }),
      ]),
    );
    expect(result.job.workAuthorizationRequirements[0]).toMatchObject({
      countryGroup: 'EU',
      securityClearanceRequired: true,
    });
    expect(result.job.skillRequirements).toHaveLength(6);
  });

  it.each([
    ['EUR 500-700 per day gross', 500, 700, 'DAY', 'GROSS'],
    ['$80,000 per year net', 80000, undefined, 'YEAR', 'NET'],
    ['GBP 50 per hour', 50, undefined, 'HOUR', 'UNSPECIFIED'],
    ['EUR 2000 monthly', 2000, undefined, 'MONTH', 'UNSPECIFIED'],
    ['EUR 1000 weekly', 1000, undefined, 'WEEK', 'UNSPECIFIED'],
    ['EUR 900 contract', 900, undefined, 'CONTRACT', 'UNSPECIFIED'],
    ['CHF 90k-110k per annum', 90000, 110000, 'YEAR', 'UNSPECIFIED'],
    ['80k-100k EUR per year', 80000, 100000, 'YEAR', 'UNSPECIFIED'],
  ] as const)(
    'parses explicit salary text %s',
    (salaryText, minimum, maximum, period, grossNet) => {
      const result = normalizeJobForProcessing(
        job({ metadata: { salaryText } }),
        filters,
        '2026-07-29T12:00:00.000Z',
      );
      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS')
        expect(result.job.salary).toMatchObject({
          minimumAmount: minimum,
          ...(maximum === undefined ? {} : { maximumAmount: maximum }),
          period,
          grossNet,
          parsingStatus: 'PARSED',
        });
    },
  );

  it('preserves structured starting, maximum, exact, and ranged salaries', () => {
    const cases = [
      job({ salaryMinimum: 10, salaryCurrency: 'eur' }),
      job({ salaryMaximum: 20 }),
      job({ salaryMinimum: 10, salaryMaximum: 10 }),
      job({ salaryMinimum: 10, salaryMaximum: 20, salaryPeriod: 'year' }),
    ];
    const kinds = cases.map((input) => {
      const result = normalizeJobForProcessing(
        input,
        filters,
        '2026-07-29T12:00:00.000Z',
      );
      return result.status === 'SUCCESS' ? result.job.salary?.kind : undefined;
    });
    expect(kinds).toEqual(['STARTING', 'MAXIMUM', 'EXACT', 'RANGE']);
  });

  it('returns structured failures and warnings for invalid inputs', () => {
    expect(
      normalizeJobForProcessing(
        job({ company: ' ' }),
        filters,
        '2026-07-29T12:00:00.000Z',
      ),
    ).toMatchObject({ status: 'FAILED' });
    expect(
      normalizeJobForProcessing(
        job({ applicationUrl: 'not a URL' }),
        filters,
        '2026-07-29T12:00:00.000Z',
      ),
    ).toMatchObject({ status: 'FAILED' });
    const ambiguous = normalizeJobForProcessing(
      job({ metadata: { locationText: 'Somewhere nearby' } }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(ambiguous.status).toBe('SUCCESS');
    if (ambiguous.status === 'SUCCESS')
      expect(ambiguous.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'AMBIGUOUS_LOCATION' }),
        ]),
      );
  });

  it('bounds inputs, records remote conflicts, and parses up-to experience', () => {
    const result = normalizeJobForProcessing(
      job({
        title: `Data Engineer ${'x'.repeat(1_100)}`,
        description: `Up to 2 years of experience required. ${'x'.repeat(100_000)}`,
        metadata: { locationText: 'Remote in Germany' },
        remotePolicy: 'onsite',
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.job.cleanedTitle).toHaveLength(1_000);
    expect(result.job.description).toHaveLength(100_000);
    expect(result.job.experienceRequirements[0]).toMatchObject({
      minimumYears: 0,
      maximumYears: 2,
      level: 'REQUIRED',
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'INPUT_TRUNCATED',
      'CONFLICTING_REMOTE_POLICY',
      'INPUT_TRUNCATED',
    ]);
  });

  it('does not infer education or language requirements from descriptive prose', () => {
    const result = normalizeJobForProcessing(
      job({
        description:
          'Our PhD researchers publish in German. All applicants receive equal consideration.',
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    expect(result.job.educationRequirements).toEqual([]);
    expect(result.job.languageRequirements).toEqual([]);
  });
});

describe('hard filters', () => {
  it('collects every applicable reason in deterministic filter order', () => {
    const normalized = normalizeJobForProcessing(
      job({
        title: 'Senior Sales Engineer',
        company: 'Blocked GmbH',
        description:
          'Required: 5+ years of experience. German C1 required. PhD required. Must be authorized to work in the United States without sponsorship.',
        metadata: {
          locationText: 'New York, United States',
          industry: 'Gambling',
        },
        expiresAt: '2026-07-29T12:00:00.000Z',
      }),
      filters,
      '2026-07-29T11:00:00.000Z',
    );
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    const result = evaluateHardFilters({
      job: normalized.job,
      candidate,
      configuration: filters,
      processingTime: '2026-07-29T12:00:00.000Z',
    });
    expect(result.decision).toBe('REJECTED');
    expect(result.reasons.map((item) => item.code)).toEqual([
      'COUNTRY_NOT_ALLOWED',
      'WORK_AUTHORIZATION_NOT_AVAILABLE',
      'MISSING_REQUIRED_LANGUAGE',
      'SENIORITY_EXCEEDS_MAXIMUM',
      'EXPERIENCE_EXCEEDS_MAXIMUM',
      'PHD_REQUIRED',
      'EXCLUDED_COMPANY',
      'EXCLUDED_INDUSTRY',
      'EXCLUDED_TITLE_PATTERN',
      'JOB_EXPIRED',
    ]);
  });

  it('does not reject unknowns or preferred requirements under permissive policy', () => {
    const normalized = normalizeJobForProcessing(
      job({
        description:
          'German C1 preferred. PhD or equivalent experience preferred.',
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    expect(
      evaluateHardFilters({
        job: normalized.job,
        candidate,
        configuration: filters,
        processingTime: '2026-07-29T12:00:00.000Z',
      }),
    ).toEqual({ decision: 'ELIGIBLE', reasons: [] });
  });

  it('applies configured unknown, group, sponsorship, education, and date policies', () => {
    const normalized = normalizeJobForProcessing(
      job(),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    const base = normalized.job;
    const unknownLocation = { ...base.location };
    delete unknownLocation.countryCode;
    const unknownIndustry = { ...base };
    delete unknownIndustry.industry;
    const evaluate = (
      changedJob: typeof base,
      changedFilters: HardFilterConfiguration = filters,
      changedCandidate: CandidateProfile = candidate,
    ) =>
      evaluateHardFilters({
        job: changedJob,
        candidate: changedCandidate,
        configuration: changedFilters,
        processingTime: '2026-07-29T12:00:00.000Z',
      });

    expect(
      evaluate(
        { ...base, location: unknownLocation },
        { ...filters, rejectUnknownLocation: true },
      ).reasons.map((reason) => reason.code),
    ).toContain('COUNTRY_NOT_ALLOWED');
    expect(
      evaluate(unknownIndustry, {
        ...filters,
        rejectUnknownIndustry: true,
      }).reasons.map((reason) => reason.code),
    ).toContain('EXCLUDED_INDUSTRY');
    for (const remoteScope of ['WORLDWIDE', 'EU', 'EEA'] as const)
      expect(
        evaluate({ ...base, location: { ...unknownLocation, remoteScope } })
          .reasons,
      ).toEqual([]);
    expect(
      evaluate(
        {
          ...base,
          location: {
            ...base.location,
            countryCode: 'GB',
            remoteScope: 'EUROPE',
          },
        },
        { ...filters, allowedCountryGroups: ['EUROPE'] },
      ).reasons,
    ).toEqual([]);
    expect(
      evaluate({
        ...base,
        workAuthorizationRequirements: [
          {
            countryCode: 'US',
            sponsorshipAvailable: true,
            citizenshipOnly: false,
            securityClearanceRequired: false,
            evidence: 'Sponsorship is available.',
          },
        ],
      }).reasons,
    ).toEqual([]);
    expect(
      evaluate(
        {
          ...base,
          educationRequirements: [
            {
              level: 'doctorate',
              requirement: 'REQUIRED',
              acceptsEquivalentExperience: false,
              evidence: 'PhD required.',
            },
          ],
        },
        filters,
        {
          ...candidate,
          education: [{ level: 'doctorate', field: 'Synthetic field' }],
        },
      ).reasons,
    ).toEqual([]);
    expect(evaluate({ ...base, expiresAt: 'not-a-date' }).reasons).toEqual([]);
  });

  it('accepts any allowed location and enforces citizenship-only requirements', () => {
    const normalized = normalizeJobForProcessing(
      job({
        locations: [{ country: 'US' }, { country: 'DE', city: 'Berlin' }],
      }),
      filters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    expect(normalized.job.location.countryCodes).toEqual(['US', 'DE']);
    expect(
      evaluateHardFilters({
        job: normalized.job,
        candidate,
        configuration: filters,
        processingTime: '2026-07-29T12:00:00.000Z',
      }).reasons,
    ).toEqual([]);
    const citizenshipOnly = {
      ...normalized.job,
      workAuthorizationRequirements: [
        {
          countryCode: 'US',
          sponsorshipAvailable: false as const,
          citizenshipOnly: true,
          securityClearanceRequired: false,
          evidence: 'US citizens only.',
        },
      ],
    };
    const authorizedButNotCitizen = {
      ...candidate,
      workAuthorizations: [
        ...candidate.workAuthorizations,
        { country: 'US', status: 'authorized' as const },
      ],
    };
    expect(
      evaluateHardFilters({
        job: citizenshipOnly,
        candidate: authorizedButNotCitizen,
        configuration: filters,
        processingTime: '2026-07-29T12:00:00.000Z',
      }).reasons.map((reason) => reason.code),
    ).toContain('WORK_AUTHORIZATION_NOT_AVAILABLE');
  });

  it.each(['EU', 'EEA', 'EUROPE'] as const)(
    'accepts %s remote scope when an explicitly allowed country is inside it',
    (remoteScope) => {
      const normalized = normalizeJobForProcessing(
        job({
          metadata: { locationText: `Remote ${remoteScope}` },
          remotePolicy: 'remote',
        }),
        filters,
        '2026-07-29T12:00:00.000Z',
      );
      expect(normalized.status).toBe('SUCCESS');
      if (normalized.status !== 'SUCCESS') return;
      const location = { ...normalized.job.location, remoteScope };
      delete location.countryCode;
      expect(
        evaluateHardFilters({
          job: {
            ...normalized.job,
            location: { ...location, countryCodes: [] },
          },
          candidate,
          configuration: { ...filters, allowedCountryGroups: [] },
          processingTime: '2026-07-29T12:00:00.000Z',
        }).reasons,
      ).toEqual([]);
    },
  );
});

function job(overrides: Partial<ProcessableJob> = {}): ProcessableJob {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    sourceId: 'source-a',
    externalId: 'job-a',
    sourceUrl: 'https://jobs.example.test/one',
    canonicalUrl: 'https://jobs.example.test/one',
    title: 'Data Engineer',
    company: 'Example Labs',
    locations: [],
    firstSeenAt: '2026-07-28T12:00:00.000Z',
    lastCollectedAt: '2026-07-29T10:00:00.000Z',
    inputRevisionNumber: 0,
    ...overrides,
  };
}
