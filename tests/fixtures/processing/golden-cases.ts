import type { ProcessableJob } from '../../../src/domain/index.js';

export interface GoldenProcessingCase {
  readonly name: string;
  readonly input: Partial<ProcessableJob>;
  readonly expected: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
}

export const goldenProcessingCases: readonly GoldenProcessingCase[] = [
  {
    name: 'junior remote EU data role',
    input: {
      title: 'Junior Data Scientist',
      metadata: { locationText: 'Remote within the EU' },
      remotePolicy: 'remote',
    },
    expected: { title: 'Data Scientist', seniority: 'entry', scope: 'EU' },
  },
  {
    name: 'senior US-only role',
    input: {
      title: 'Senior Data Scientist',
      metadata: { locationText: 'Remote - US only' },
      remotePolicy: 'remote',
    },
    expected: { seniority: 'senior', country: 'US', scope: 'COUNTRY' },
  },
  {
    name: 'German-required role',
    input: { description: 'German C1 proficiency is required.' },
    expected: { language: 'de', languageRequirement: 'REQUIRED' },
  },
  {
    name: 'PhD-required research role',
    input: { description: 'Candidates must have a PhD degree.' },
    expected: { education: 'doctorate', educationRequirement: 'REQUIRED' },
  },
  {
    name: 'ambiguous remote role',
    input: {
      metadata: { locationText: 'Remote' },
      remotePolicy: 'remote',
    },
    expected: { scope: 'UNSPECIFIED' },
  },
  {
    name: 'hybrid Milan role',
    input: { metadata: { locationText: 'Hybrid - Milan' } },
    expected: { remotePolicy: 'hybrid', cityText: 'Hybrid - Milan' },
  },
  {
    name: 'internship',
    input: {
      title: 'Software Engineering Internship',
      employmentType: 'internship',
    },
    expected: { seniority: 'intern', employmentType: 'internship' },
  },
  {
    name: 'contract role with salary',
    input: {
      employmentType: 'contract',
      metadata: { salaryText: 'EUR 500-700 per day gross' },
    },
    expected: { salaryMinimum: 500, salaryMaximum: 700, salaryPeriod: 'DAY' },
  },
  {
    name: 'same-title distinct requisition',
    input: { externalId: 'requisition-002' },
    expected: { externalId: 'requisition-002' },
  },
  {
    name: 'canonical URL duplicate',
    input: {
      applicationUrl: 'https://apply.example.test/jobs/one?utm_source=x',
    },
    expected: { canonicalUrl: 'https://apply.example.test/jobs/one' },
  },
  {
    name: 'expired role',
    input: { expiresAt: '2026-07-28T00:00:00.000Z' },
    expected: { expiresAt: '2026-07-28T00:00:00.000Z' },
  },
  {
    name: 'malformed salary source content',
    input: { metadata: { salaryText: 'Competitive plus many benefits' } },
    expected: { salaryStatus: 'UNPARSEABLE', salaryIssue: true },
  },
];
