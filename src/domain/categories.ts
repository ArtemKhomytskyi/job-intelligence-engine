export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'internship',
  'temporary',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SENIORITY_LEVELS = [
  'intern',
  'entry',
  'mid',
  'senior',
  'lead',
  'manager',
  'director',
  'executive',
] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const REMOTE_POLICIES = ['onsite', 'hybrid', 'remote'] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export const COMPANY_SIZES = [
  'startup',
  'small',
  'medium',
  'large',
  'enterprise',
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const EDUCATION_LEVELS = [
  'secondary',
  'vocational',
  'bachelor',
  'master',
  'doctorate',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const LANGUAGE_PROFICIENCIES = [
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native',
] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];

export const SOURCE_TYPES = [
  'greenhouse',
  'lever',
  'generic-jsonld',
  'generic-page',
  'generic-job-list',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
