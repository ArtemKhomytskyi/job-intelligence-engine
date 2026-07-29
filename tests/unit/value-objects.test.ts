import { describe, expect, it } from 'vitest';

import {
  createExperienceRange,
  createPercentage,
  createSalaryRange,
  DomainInvariantError,
} from '../../src/domain/index.js';

describe('domain value objects', () => {
  it('accepts boundary percentages', () => {
    expect(createPercentage(0)).toBe(0);
    expect(createPercentage(100)).toBe(100);
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid percentage %s',
    (value) => {
      expect(() => createPercentage(value)).toThrow(DomainInvariantError);
    },
  );

  it('creates bounded and open-ended experience ranges', () => {
    expect(createExperienceRange(1, 5)).toEqual({
      minimumYears: 1,
      maximumYears: 5,
    });
    expect(createExperienceRange(2)).toEqual({ minimumYears: 2 });
  });

  it('rejects reversed or negative experience ranges', () => {
    expect(() => createExperienceRange(5, 2)).toThrow(
      'Experience minimum must not exceed the maximum.',
    );
    expect(() => createExperienceRange(-1)).toThrow(DomainInvariantError);
  });

  it('creates salary ranges and rejects invalid bounds', () => {
    expect(
      createSalaryRange({
        minimum: 50_000,
        maximum: 80_000,
        currency: 'EUR',
        period: 'year',
      }),
    ).toEqual({
      minimum: 50_000,
      maximum: 80_000,
      currency: 'EUR',
      period: 'year',
    });
    expect(() =>
      createSalaryRange({ currency: 'EUR', period: 'year' }),
    ).toThrow('Salary range must define a minimum, a maximum, or both.');
    expect(() =>
      createSalaryRange({
        minimum: 10,
        maximum: 5,
        currency: 'EUR',
        period: 'year',
      }),
    ).toThrow('Salary minimum must not exceed the maximum.');
  });
});
