import type { CurrencyCode, SalaryPeriod } from './categories.js';

declare const percentageBrand: unique symbol;

export type Percentage = number & { readonly [percentageBrand]: true };

export type DomainInvariantCode =
  'PERCENTAGE_INVALID' | 'EXPERIENCE_RANGE_INVALID' | 'SALARY_RANGE_INVALID';

export class DomainInvariantError extends Error {
  public readonly code: DomainInvariantCode;

  public constructor(code: DomainInvariantCode, message: string) {
    super(message);
    this.name = 'DomainInvariantError';
    this.code = code;
  }
}

export function createPercentage(value: number): Percentage {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new DomainInvariantError(
      'PERCENTAGE_INVALID',
      'Percentage must be a finite number from 0 through 100.',
    );
  }

  return value as Percentage;
}

export interface ExperienceRange {
  readonly minimumYears: number;
  readonly maximumYears?: number;
}

export function createExperienceRange(
  minimumYears: number,
  maximumYears?: number,
): ExperienceRange {
  assertNonNegativeFinite(minimumYears, 'minimumYears');

  if (maximumYears !== undefined) {
    assertNonNegativeFinite(maximumYears, 'maximumYears');
    if (minimumYears > maximumYears) {
      throw new DomainInvariantError(
        'EXPERIENCE_RANGE_INVALID',
        'Experience minimum must not exceed the maximum.',
      );
    }
  }

  return Object.freeze({
    minimumYears,
    ...(maximumYears === undefined ? {} : { maximumYears }),
  });
}

export interface SalaryRange {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly currency: CurrencyCode;
  readonly period: SalaryPeriod;
}

export function createSalaryRange(input: {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly currency: CurrencyCode;
  readonly period: SalaryPeriod;
}): SalaryRange {
  if (input.minimum === undefined && input.maximum === undefined) {
    throw new DomainInvariantError(
      'SALARY_RANGE_INVALID',
      'Salary range must define a minimum, a maximum, or both.',
    );
  }

  if (input.minimum !== undefined) {
    assertNonNegativeFinite(input.minimum, 'minimum');
  }
  if (input.maximum !== undefined) {
    assertNonNegativeFinite(input.maximum, 'maximum');
  }
  if (
    input.minimum !== undefined &&
    input.maximum !== undefined &&
    input.minimum > input.maximum
  ) {
    throw new DomainInvariantError(
      'SALARY_RANGE_INVALID',
      'Salary minimum must not exceed the maximum.',
    );
  }

  return Object.freeze({ ...input });
}

function assertNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainInvariantError(
      field.includes('Years')
        ? 'EXPERIENCE_RANGE_INVALID'
        : 'SALARY_RANGE_INVALID',
      `${field} must be a finite non-negative number.`,
    );
  }
}
