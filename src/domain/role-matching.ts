import type { SeniorityLevel } from './categories.js';
import type { ScoringAlias } from './scoring-config.js';

export const ROLE_FAMILIES = [
  'software-engineering',
  'machine-learning-ai',
  'data-science',
  'quantitative-research',
  'developer-relations',
  'technical-marketing',
  'technical-community',
  'community',
  'product-management',
  'project-program-management',
  'people-management',
  'customer-success',
  'customer-support',
  'sales',
  'recruiting',
  'design',
  'legal',
  'finance-accounting',
  'operations',
] as const;

export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export interface RoleTitleAnalysis {
  readonly normalizedTitle: string;
  readonly canonicalTitle: string;
  readonly seniority?: SeniorityLevel;
  readonly families: readonly RoleFamily[];
}

const FAMILY_RULES: readonly {
  readonly family: RoleFamily;
  readonly pattern: RegExp;
}[] = [
  {
    family: 'developer-relations',
    pattern: /\b(?:developer advocate|developer relations|devrel)\b/iu,
  },
  {
    family: 'technical-marketing',
    pattern:
      /\b(?:product marketing|developer marketing|technical marketing|technical content)\b/iu,
  },
  {
    family: 'technical-community',
    pattern:
      /\b(?:technical community|developer community|developer ecosystem|ecosystem lead)\b/iu,
  },
  {
    family: 'customer-success',
    pattern:
      /\b(?:customer success|customer enablement|account management)\b/iu,
  },
  {
    family: 'customer-support',
    pattern:
      /\b(?:customer support|enterprise support|support specialist|support engineer|technical support)\b/iu,
  },
  {
    family: 'sales',
    pattern:
      /\b(?:account executive|sales development|sales representative|enterprise sales|inside sales|sales manager|sales operations)\b/iu,
  },
  {
    family: 'recruiting',
    pattern: /\b(?:recruiter|recruiting|talent acquisition)\b/iu,
  },
  {
    family: 'project-program-management',
    pattern:
      /\b(?:(?:technical |strategic )?program manager|project manager|program management|project management)\b/iu,
  },
  {
    family: 'product-management',
    pattern: /\bproduct manager\b/iu,
  },
  {
    family: 'people-management',
    pattern:
      /\b(?:engineering manager|manager,? (?:software )?engineering|people manager|head of|director|vice president|vp|chief)\b/iu,
  },
  {
    family: 'quantitative-research',
    pattern: /\b(?:quantitative|quant) (?:researcher|research|developer)\b/iu,
  },
  {
    family: 'data-science',
    pattern: /\b(?:data scientist|applied scientist|decision scientist)\b/iu,
  },
  {
    family: 'machine-learning-ai',
    pattern:
      /\b(?:machine learning|ml engineer|ai engineer|ai scientist|artificial intelligence|generative ai|ai product|ai platform)\b/iu,
  },
  {
    family: 'software-engineering',
    pattern:
      /\b(?:software engineer|software developer|backend engineer|front[- ]?end engineer|full[- ]?stack engineer|platform engineer|data engineer|developer experience engineer|forward deployed engineer)\b/iu,
  },
  {
    family: 'design',
    pattern:
      /\b(?:product designer|ux designer|ui designer|design engineer)\b/iu,
  },
  {
    family: 'legal',
    pattern: /\b(?:counsel|attorney|legal)\b/iu,
  },
  {
    family: 'finance-accounting',
    pattern:
      /\b(?:accounting|accountant|finance|financial analyst|credit|collections)\b/iu,
  },
  {
    family: 'operations',
    pattern: /\b(?:business operations|strategy and operations|operations)\b/iu,
  },
  {
    family: 'community',
    pattern: /\bcommunity (?:manager|lead|specialist)\b/iu,
  },
];

export function analyzeRoleTitle(
  value: string,
  aliases: readonly ScoringAlias[] = [],
): RoleTitleAnalysis {
  const normalizedTitle = normalizeRoleTitle(value);
  const canonicalTitle = canonicalAlias(normalizedTitle, aliases);
  const families = FAMILY_RULES.filter((rule) =>
    rule.pattern.test(canonicalTitle),
  ).map((rule) => rule.family);
  const seniority = titleSeniority(canonicalTitle);
  return {
    normalizedTitle,
    canonicalTitle,
    ...(seniority === undefined ? {} : { seniority }),
    families,
  };
}

export function normalizeRoleTitle(value: string): string {
  return value
    .normalize('NFKC')
    .replace(
      /\s*\((?:[^()]*(?:united states|united kingdom|germany|france|canada|australia|india|japan|singapore|brazil|remote|new york|london|berlin|paris|tokyo|sydney)[^()]*)\)\s*$/iu,
      '',
    )
    .replace(/\s*(?:\||\u2013|\u2014)\s*(?:remote|hybrid|onsite)\s*$/iu, '')
    .replace(/\s*[|â€“â€”]\s*(?:remote|hybrid|onsite)\s*$/iu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function phraseMatches(value: string, phrase: string): boolean {
  const text = ` ${normalizeRoleTitle(value)} `;
  const target = normalizeRoleTitle(phrase);
  if (target === 'go' && /\bgo[- ]to[- ]market\b/iu.test(value)) return false;
  return target.length > 0 && text.includes(` ${target} `);
}

export function exactTitleMatches(
  value: string,
  expected: string,
  aliases: readonly ScoringAlias[] = [],
): boolean {
  return (
    canonicalAlias(normalizeRoleTitle(value), aliases) ===
    canonicalAlias(normalizeRoleTitle(expected), aliases)
  );
}

function canonicalAlias(
  value: string,
  aliases: readonly ScoringAlias[],
): string {
  for (const alias of aliases) {
    const values = [alias.canonical, ...alias.aliases].map(normalizeRoleTitle);
    if (values.includes(value)) return normalizeRoleTitle(alias.canonical);
  }
  return value;
}

function titleSeniority(value: string): SeniorityLevel | undefined {
  if (/\b(?:chief|c[etdpo]o)\b/iu.test(value)) return 'executive';
  if (/\b(?:vice president|vp)\b/iu.test(value)) return 'vp';
  if (/\b(?:director|head of)\b/iu.test(value)) return 'director';
  if (/\b(?:engineering manager|people manager)\b/iu.test(value))
    return 'manager';
  if (/\bprincipal\b/iu.test(value)) return 'principal';
  if (/\bstaff\b/iu.test(value)) return 'staff';
  if (/\blead\b/iu.test(value)) return 'lead';
  if (/\b(?:senior|sr)\b/iu.test(value)) return 'senior';
  if (/\b(?:junior|jr|entry level)\b/iu.test(value)) return 'entry';
  if (/\b(?:intern|internship)\b/iu.test(value)) return 'intern';
  return undefined;
}
