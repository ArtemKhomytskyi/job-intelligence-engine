import { describe, expect, it } from 'vitest';

import {
  discoverAtsProvider,
  type CompanyConfig,
} from '../../src/domain/index.js';

const company: CompanyConfig = {
  id: 'synthetic-labs',
  name: 'Synthetic Labs',
  enabled: true,
  tags: [],
  trackIds: [],
  trackPolicy: 'preferred',
};

describe('deterministic ATS discovery', () => {
  it.each([
    ['https://boards.greenhouse.io/synthetic', 'greenhouse'],
    ['https://jobs.lever.co/synthetic', 'lever'],
    ['https://jobs.ashbyhq.com/synthetic', 'ashby'],
    ['https://jobs.smartrecruiters.com/Synthetic', 'smartrecruiters'],
    ['https://apply.workable.com/synthetic', 'workable'],
    ['https://synthetic.bamboohr.com/careers', 'bamboohr'],
    ['https://synthetic.recruitee.com', 'recruitee'],
    ['https://synthetic.teamtailor.com/jobs', 'teamtailor'],
    ['https://synthetic.jobs.personio.de', 'personio'],
    ['https://jobs.jobvite.com/synthetic/jobs', 'jobvite'],
  ] as const)('discovers %s as %s', (careersUrl, provider) => {
    expect(
      discoverAtsProvider({ company, requestedUrl: careersUrl }),
    ).toMatchObject({
      status: 'DISCOVERED',
      provider,
      confidence: 96,
      method: 'URL_PATTERN',
    });
  });

  it('uses redirect evidence ahead of the requested URL', () => {
    expect(
      discoverAtsProvider({
        company,
        requestedUrl: 'https://careers.example.test',
        finalUrl: 'https://jobs.ashbyhq.com/synthetic',
      }),
    ).toMatchObject({
      provider: 'ashby',
      confidence: 98,
      method: 'REDIRECT_URL',
    });
  });

  it('uses HTML fingerprints without exposing page content', () => {
    const result = discoverAtsProvider({
      company,
      requestedUrl: 'https://careers.example.test',
      html: '<script src="https://api.smartrecruiters.com/widgets.js"></script>',
    });
    expect(result).toMatchObject({
      provider: 'smartrecruiters',
      confidence: 85,
    });
    expect(JSON.stringify(result)).not.toContain('<script');
  });

  it('returns an explainable unknown result instead of guessing', () => {
    expect(
      discoverAtsProvider({
        company,
        requestedUrl: 'https://careers.example.test',
      }),
    ).toEqual({
      companyId: company.id,
      companyName: company.name,
      careersUrl: 'https://careers.example.test',
      status: 'UNKNOWN_PROVIDER',
      confidence: 0,
      method: 'UNKNOWN',
      evidence: [],
      diagnostics: ['No supported ATS fingerprint matched.'],
    });
  });

  it('honors explicit overrides without provider guessing', () => {
    expect(
      discoverAtsProvider({
        company: {
          ...company,
          sourceOverride: { type: 'personio', identifier: 'synthetic' },
        },
      }),
    ).toMatchObject({
      status: 'DISCOVERED',
      provider: 'personio',
      confidence: 100,
      method: 'SOURCE_OVERRIDE',
    });
  });
});
