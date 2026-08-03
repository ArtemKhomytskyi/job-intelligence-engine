import { describe, expect, it } from 'vitest';

import {
  analyzeRoleTitle,
  exactTitleMatches,
  normalizeRoleTitle,
  phraseMatches,
} from '../../src/domain/index.js';

describe('candidate matching role taxonomy', () => {
  it.each([
    ['Account Executive, Enterprise (Berlin, Germany)', ['sales']],
    [
      'Software Engineer, AI Product',
      ['machine-learning-ai', 'software-engineering'],
    ],
    ['Developer Advocate', ['developer-relations']],
    ['Technical Community Manager', ['technical-community', 'community']],
    ['Community Support Specialist', ['customer-support']],
    [
      'Product Manager, AI Platform',
      ['product-management', 'machine-learning-ai'],
    ],
    ['Product Marketing Manager', ['technical-marketing']],
    ['Project Manager', ['project-program-management']],
    ['Engineering Manager', ['people-management']],
  ])('classifies %s without unrelated role families', (title, families) => {
    expect(analyzeRoleTitle(title).families).toEqual(families);
  });

  it('normalizes location and work-mode suffixes and extracts seniority', () => {
    expect(
      normalizeRoleTitle('Senior Data Scientist (London, United Kingdom)'),
    ).toBe('senior data scientist');
    expect(normalizeRoleTitle('ML Engineer — Remote')).toBe('ml engineer');
    expect(analyzeRoleTitle('Director of Engineering').seniority).toBe(
      'director',
    );
  });

  it('uses explicit aliases and boundary-aware phrases', () => {
    const aliases = [
      { canonical: 'developer advocate', aliases: ['developer evangelist'] },
    ];
    expect(
      exactTitleMatches('Developer Evangelist', 'Developer Advocate', aliases),
    ).toBe(true);
    expect(
      phraseMatches('Enterprise account executive', 'account executive'),
    ).toBe(true);
    expect(phraseMatches('Wholesale platform engineer', 'sales')).toBe(false);
    expect(phraseMatches('Go-to-Market Manager', 'Go')).toBe(false);
  });
});
