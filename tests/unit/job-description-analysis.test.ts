import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { htmlToPlainText } from '../../src/application/index.js';
import {
  analyzeJobDescription,
  normalizeJobForProcessing,
  type HardFilterConfiguration,
  type ProcessableJob,
} from '../../src/domain/index.js';

const filters: HardFilterConfiguration = {
  allowedCountries: [],
  allowedCountryGroups: [],
  rejectUnknownLocation: false,
  unknownCandidateLanguageLevelPolicy: 'allow',
  maximumSeniority: 'executive',
  maximumRequiredExperienceYears: 20,
  allowMandatoryPhd: true,
  excludedCompanies: [],
  excludedIndustries: [],
  excludedTitlePhrases: [],
  rejectUnknownIndustry: false,
  removableTrackingParameters: [],
  companyLegalSuffixes: [],
};

describe('layered deterministic job description analysis', () => {
  it('extracts representative Greenhouse-style content across all field groups', async () => {
    const html = await readFile(
      new URL(
        '../fixtures/extraction/greenhouse-platform-role.html',
        import.meta.url,
      ),
      'utf8',
    );
    const description = htmlToPlainText(html);
    if (description === undefined) throw new Error('Fixture has no text.');
    const result = normalizeJobForProcessing(
      job({ description }),
      filters,
      '2026-08-03T12:00:00.000Z',
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;
    const analysis = result.job.descriptionAnalysis;
    expect(analysis).toBeDefined();
    if (analysis === undefined) return;

    expect(result.job.experienceRequirements[0]).toMatchObject({
      minimumYears: 5,
      level: 'REQUIRED',
      extraction: {
        source: 'Required qualifications',
        strategy: 'RegexYears',
      },
    });
    expect(
      result.job.skillRequirements.map((fact) => [
        fact.canonicalName,
        fact.category,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['TypeScript', 'PROGRAMMING_LANGUAGE'],
        ['React', 'FRAMEWORK'],
        ['Node.js', 'FRAMEWORK'],
        ['GraphQL', 'PROTOCOL'],
        ['AWS', 'CLOUD_PROVIDER'],
        ['PostgreSQL', 'DATABASE'],
        ['Kubernetes', 'PLATFORM'],
        ['Terraform', 'PLATFORM'],
        ['Redis', 'DATABASE'],
      ]),
    );
    expect(result.job.educationRequirements[0]).toMatchObject({
      level: 'bachelor',
      requirement: 'REQUIRED',
      acceptsEquivalentExperience: true,
    });
    expect(result.job.languageRequirements[0]).toMatchObject({
      code: 'en',
      proficiency: 'professional',
      requirement: 'REQUIRED',
    });
    expect(result.job.location).toMatchObject({
      remotePolicy: 'remote',
      remoteScope: 'EU',
    });
    expect(result.job.employmentType).toBe('full-time');
    expect(result.job.salary).toMatchObject({
      minimumAmount: 80000,
      maximumAmount: 100000,
      currency: 'EUR',
      period: 'YEAR',
      grossNet: 'GROSS',
    });
    expect(analysis.contractTypes[0]?.value).toContain('permanent');
    expect(analysis.travelRequirements[0]).toMatchObject({
      required: true,
      maximumPercentage: 25,
    });
    expect(analysis.visaSponsorship[0]?.value).toBe(true);
    expect(analysis.securityClearance[0]?.value).toBe(true);
    expect(analysis.relocationSupport[0]?.value).toBe(true);
    expect(analysis.certifications[0]?.value).toContain('AWS Certified');
    expect(analysis.responsibilities).toHaveLength(2);
    expect(analysis.requiredQualifications.length).toBeGreaterThanOrEqual(6);
    expect(analysis.preferredQualifications).toHaveLength(2);
    expect(analysis.niceToHaveQualifications).toHaveLength(1);
    expect(analysis.benefits).toHaveLength(2);
  });

  it('merges structured facts ahead of prose and preserves provenance', () => {
    const analysis = analyzeJobDescription(
      'Requirements\nReact and TypeScript are required.\nReact is required.',
      {
        structuredJobData: {
          skills: ['React', 'Google Cloud'],
          qualifications: 'Six years of engineering experience.',
          responsibilities: 'Build deterministic services.',
          jobBenefits: 'Learning budget.',
        },
      },
    );
    expect(
      analysis.technologyRequirements.filter(
        (fact) => fact.canonicalName === 'React',
      ),
    ).toHaveLength(1);
    expect(
      analysis.technologyRequirements.find(
        (fact) => fact.canonicalName === 'React',
      )?.extraction,
    ).toEqual({
      source: 'json-ld.skills',
      strategy: 'StructuredData',
      confidence: 0.98,
    });
    expect(analysis.experienceRequirements[0]).toMatchObject({
      minimumYears: 6,
      extraction: { source: 'json-ld.qualifications' },
    });
    expect(analysis.responsibilities[0]?.extraction.strategy).toBe(
      'StructuredData',
    );
    expect(analysis.benefits[0]?.value).toBe('Learning budget.');
  });

  it('recognizes alternate headings and nested bullet lists without flattening evidence', () => {
    const description = htmlToPlainText(`
      <section>
        <h3>What you'll bring</h3>
        <ul>
          <li>At least four years of data engineering experience.</li>
          <li>Python and Google Cloud.
            <ul><li>Airflow is required.</li></ul>
          </li>
        </ul>
        <h3>Bonus points</h3>
        <ul><li>dbt and Snowflake experience.</li></ul>
        <h3>Why join us</h3>
        <ul><li>Home-office equipment.</li></ul>
      </section>
    `);
    expect(description).toBeDefined();
    const analysis = analyzeJobDescription(description);
    expect(analysis.experienceRequirements[0]).toMatchObject({
      minimumYears: 4,
      level: 'REQUIRED',
      extraction: { source: "What you'll bring", strategy: 'RegexYears' },
    });
    expect(
      analysis.technologyRequirements.map((fact) => fact.canonicalName),
    ).toEqual(
      expect.arrayContaining([
        'Data Engineering',
        'Python',
        'Google Cloud',
        'Airflow',
        'dbt',
        'Snowflake',
      ]),
    );
    expect(
      analysis.technologyRequirements.find(
        (fact) => fact.canonicalName === 'dbt',
      ),
    ).toMatchObject({
      requirement: 'PREFERRED',
      extraction: { source: 'Bonus points' },
    });
    expect(analysis.benefits[0]).toMatchObject({
      value: 'Home-office equipment.',
      extraction: { source: 'Why join us', strategy: 'BulletPattern' },
    });
  });

  it('handles missing headings, duplicate content, negative context, and malformed spacing', () => {
    const analysis = analyzeJobDescription(
      [
        '  TypeScript   experience is required. ',
        'TypeScript experience is required.',
        'React is not required.',
        'The company was founded five years ago and uses English branding.',
        'No travel is required.',
        'We do not offer visa sponsorship.',
      ].join('\n'),
    );
    expect(
      analysis.technologyRequirements.map((fact) => fact.canonicalName),
    ).toEqual(['TypeScript']);
    expect(analysis.experienceRequirements).toEqual([]);
    expect(analysis.languageRequirements).toEqual([]);
    expect(analysis.travelRequirements[0]?.required).toBe(false);
    expect(analysis.visaSponsorship[0]?.value).toBe(false);
  });
});

function job(overrides: Partial<ProcessableJob>): ProcessableJob {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    sourceId: 'synthetic-greenhouse',
    externalId: 'platform-role',
    sourceUrl: 'https://jobs.example.test/platform-role',
    canonicalUrl: 'https://jobs.example.test/platform-role',
    applicationUrl: 'https://jobs.example.test/platform-role',
    title: 'Platform Engineer',
    company: 'Synthetic Systems',
    locations: [],
    firstSeenAt: '2026-08-03T10:00:00.000Z',
    lastCollectedAt: '2026-08-03T10:00:00.000Z',
    inputRevisionNumber: 0,
    ...overrides,
  };
}
