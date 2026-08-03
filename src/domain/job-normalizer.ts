import type { HardFilterConfiguration } from './search-configuration.js';
import {
  NORMALIZATION_VERSION,
  type EnrichedNormalizedJob,
  type ExtractedRemoteFact,
  type NormalizationIssue,
  type NormalizationResult,
  type NormalizedEducationRequirement,
  type NormalizedExperienceRequirement,
  type NormalizedLanguageRequirement,
  type NormalizedLocation,
  type NormalizedSalary,
  type NormalizedSkillRequirement,
  type ProcessableJob,
  type RequirementLevel,
  type WorkAuthorizationRequirement,
} from './job-processing.js';
import type { EducationLevel, SeniorityLevel } from './categories.js';
import { analyzeJobDescription } from './job-description-analysis.js';
import { normalizePublicUrlValue } from './public-url.js';

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  austria: 'AT',
  belgium: 'BE',
  bulgaria: 'BG',
  croatia: 'HR',
  cyprus: 'CY',
  czechia: 'CZ',
  denmark: 'DK',
  estonia: 'EE',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  greece: 'GR',
  hungary: 'HU',
  ireland: 'IE',
  italy: 'IT',
  latvia: 'LV',
  lithuania: 'LT',
  luxembourg: 'LU',
  malta: 'MT',
  netherlands: 'NL',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  slovakia: 'SK',
  slovenia: 'SI',
  spain: 'ES',
  sweden: 'SE',
  'united kingdom': 'GB',
  uk: 'GB',
  'united states': 'US',
  usa: 'US',
  canada: 'CA',
  switzerland: 'CH',
  norway: 'NO',
  iceland: 'IS',
};
const KNOWN_COUNTRY_CODES = new Set(Object.values(COUNTRY_ALIASES));

const NORTH_AMERICAN_REGIONS = [
  { countryCode: 'US', code: 'CA', name: 'California' },
  { countryCode: 'CA', code: 'BC', name: 'British Columbia' },
  { countryCode: 'CA', code: 'ON', name: 'Ontario' },
  { countryCode: 'CA', code: 'QC', name: 'Quebec' },
] as const;

const LANGUAGE_ALIASES = [
  ['en', 'English', /\benglish\b/iu],
  ['de', 'German', /\b(?:german|deutsch)\b/iu],
  ['fr', 'French', /\b(?:french|fran[cç]ais)\b/iu],
  ['es', 'Spanish', /\b(?:spanish|espa[nñ]ol)\b/iu],
  ['it', 'Italian', /\bitalian\b/iu],
  ['pt', 'Portuguese', /\bportuguese\b/iu],
] as const;

const SKILL_ALIASES = [
  ['PostgreSQL', /\b(?:postgres|postgresql)\b/giu],
  ['Node.js', /\b(?:node\.?(?:js)?|node\.js)\b/giu],
  ['TypeScript', /\btypescript\b/giu],
  ['JavaScript', /\bjavascript\b/giu],
  ['Python', /\bpython\b/giu],
  ['SQL', /\bsql\b/giu],
  ['R', /(?<![\p{L}\p{N}_])R(?![\p{L}\p{N}_])/gu],
] as const;

export function normalizeJobForProcessing(
  input: ProcessableJob,
  configuration: HardFilterConfiguration,
  normalizedAt: string,
): NormalizationResult {
  const issues: NormalizationIssue[] = [];
  const cleanedTitle = cleanBounded(input.title, 1_000, 'title', issues);
  const normalizedCompany = cleanBounded(
    input.company,
    1_000,
    'company',
    issues,
  );
  if (cleanedTitle.length === 0 || normalizedCompany.length === 0) {
    return {
      status: 'FAILED',
      issues: [
        {
          code: 'MISSING_REQUIRED_FIELD',
          field: cleanedTitle.length === 0 ? 'title' : 'company',
          severity: 'ERROR',
          details: 'A non-empty title and company are required.',
        },
      ],
    };
  }
  const canonicalApplicationUrl = normalizeIdentityUrl(
    input.applicationUrl ?? input.canonicalUrl,
    configuration.removableTrackingParameters,
  );
  if (canonicalApplicationUrl === undefined) {
    return {
      status: 'FAILED',
      issues: [
        {
          code: 'INVALID_APPLICATION_URL',
          field: 'applicationUrl',
          severity: 'ERROR',
          details: 'The canonical application URL is invalid.',
          evidence: input.applicationUrl ?? input.canonicalUrl,
        },
      ],
    };
  }
  const description = input.description?.slice(0, 100_000);
  const seniority = detectSeniority(cleanedTitle, description);
  const normalizedTitle = removeSeniority(cleanedTitle, seniority?.level);
  const descriptionAnalysis = analyzeJobDescription(
    description,
    input.metadata,
  );
  const location = normalizeLocation(
    input,
    issues,
    descriptionAnalysis.remotePolicies[0],
  );
  if (input.description !== undefined && input.description.length > 100_000)
    issues.push({
      code: 'INPUT_TRUNCATED',
      field: 'description',
      severity: 'WARNING',
      details: 'Description exceeded 100000 characters and was truncated.',
    });
  const industry = metadataString(input.metadata, 'industry', 500);
  const department = metadataString(input.metadata, 'department', 500);
  const office = metadataString(input.metadata, 'office', 500);
  const salary = normalizeSalary(
    input,
    issues,
    descriptionAnalysis.salaryMentions[0]?.value,
  );
  const employmentType =
    input.employmentType ?? descriptionAnalysis.employmentTypes[0]?.value;
  const job: EnrichedNormalizedJob = {
    id: input.id,
    inputRevisionNumber: input.inputRevisionNumber,
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
    ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
    sourceUrl: input.sourceUrl,
    ...(input.applicationUrl === undefined
      ? {}
      : { applicationUrl: input.applicationUrl }),
    canonicalApplicationUrl,
    originalTitle: input.title,
    cleanedTitle,
    normalizedTitle,
    titleComparisonKey: comparisonKey(normalizedTitle),
    ...(seniority === undefined
      ? {}
      : { seniority: seniority.level, seniorityEvidence: seniority.evidence }),
    originalCompany: input.company,
    normalizedCompany,
    companyComparisonKey: companyKey(
      normalizedCompany,
      configuration.companyLegalSuffixes,
    ),
    location,
    ...(employmentType === undefined ? {} : { employmentType }),
    ...(industry === undefined ? {} : { industry }),
    ...(department === undefined ? {} : { department }),
    ...(office === undefined ? {} : { office }),
    experienceRequirements: uniqueBy(
      [
        ...descriptionAnalysis.experienceRequirements,
        ...extractExperience(description),
      ],
      (item) =>
        `${item.minimumYears ?? ''}|${item.maximumYears ?? ''}|${item.level}`,
    ),
    educationRequirements: uniqueBy(
      [
        ...descriptionAnalysis.educationRequirements,
        ...extractEducation(description),
      ],
      (item) => `${item.level}|${item.requirement}`,
    ),
    languageRequirements: uniqueBy(
      [
        ...descriptionAnalysis.languageRequirements,
        ...extractLanguages(description, issues),
      ],
      (item) => `${item.code}|${item.requirement}|${item.proficiency}`,
    ),
    skillRequirements: uniqueBy(
      [
        ...descriptionAnalysis.technologyRequirements,
        ...extractSkills(description),
      ],
      (item) => item.canonicalName,
    ),
    workAuthorizationRequirements: uniqueBy(
      [
        ...descriptionAnalysis.workAuthorizationRequirements,
        ...extractAuthorization(description),
      ],
      (item) => item.evidence,
    ),
    descriptionAnalysis,
    ...(description === undefined ? {} : { description }),
    ...(input.salaryMinimum === undefined
      ? {}
      : { salaryMinimum: input.salaryMinimum }),
    ...(input.salaryMaximum === undefined
      ? {}
      : { salaryMaximum: input.salaryMaximum }),
    ...(input.salaryCurrency === undefined
      ? {}
      : { salaryCurrency: input.salaryCurrency }),
    ...(input.salaryPeriod === undefined
      ? {}
      : { salaryPeriod: input.salaryPeriod }),
    ...(salary === undefined ? {} : { salary }),
    ...(input.publishedAt === undefined
      ? {}
      : { publishedAt: input.publishedAt }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    firstSeenAt: input.firstSeenAt,
    lastCollectedAt: input.lastCollectedAt,
    normalizationVersion: NORMALIZATION_VERSION,
    normalizedAt,
  };
  return { status: 'SUCCESS', job, issues };
}

function normalizeSalary(
  input: ProcessableJob,
  issues: NormalizationIssue[],
  extractedSalaryText?: string,
): NormalizedSalary | undefined {
  const originalText =
    metadataString(input.metadata, 'salaryText') ?? extractedSalaryText;
  if (input.salaryMinimum !== undefined || input.salaryMaximum !== undefined) {
    return {
      ...(input.salaryMinimum === undefined
        ? {}
        : { minimumAmount: input.salaryMinimum }),
      ...(input.salaryMaximum === undefined
        ? {}
        : { maximumAmount: input.salaryMaximum }),
      ...(input.salaryCurrency === undefined
        ? {}
        : { currency: input.salaryCurrency.toUpperCase() }),
      period: salaryPeriod(input.salaryPeriod),
      grossNet: salaryGrossNet(originalText),
      kind:
        input.salaryMinimum !== undefined && input.salaryMaximum !== undefined
          ? input.salaryMinimum === input.salaryMaximum
            ? 'EXACT'
            : 'RANGE'
          : input.salaryMinimum !== undefined
            ? 'STARTING'
            : 'MAXIMUM',
      ...(originalText === undefined ? {} : { originalText }),
      parsingStatus: 'STRUCTURED',
    };
  }
  if (originalText === undefined) return undefined;
  const parsed = parseSalaryText(originalText);
  if (parsed === undefined) return unparseableSalary(originalText, issues);
  return {
    minimumAmount: parsed.minimumAmount,
    ...(parsed.maximumAmount === undefined
      ? {}
      : { maximumAmount: parsed.maximumAmount }),
    currency: parsed.currency,
    period: salaryPeriod(originalText),
    grossNet: salaryGrossNet(originalText),
    kind: parsed.maximumAmount === undefined ? 'EXACT' : 'RANGE',
    originalText,
    parsingStatus: 'PARSED',
  };
}

function parseSalaryText(value: string):
  | {
      readonly minimumAmount: number;
      readonly maximumAmount?: number;
      readonly currency: string;
    }
  | undefined {
  const prefix =
    /(?:\b(EUR|USD|GBP|CHF|CAD|AUD)\b|([€$£]))\s*([\d,.]+)\s*([kK])?(?:\s*(?:[-–—]|to)\s*(?:\b(?:EUR|USD|GBP|CHF|CAD|AUD)\b|[€$£])?\s*([\d,.]+)\s*([kK])?)?/iu.exec(
      value,
    );
  const suffix =
    /([\d,.]+)\s*([kK])?(?:\s*(?:[-–—]|to)\s*([\d,.]+)\s*([kK])?)?\s*\b(EUR|USD|GBP|CHF|CAD|AUD)\b/iu.exec(
      value,
    );
  const minimumAmount = parseSalaryAmount(
    prefix?.[3] ?? suffix?.[1],
    prefix?.[4] ?? suffix?.[2],
  );
  const maximumAmount = parseSalaryAmount(
    prefix?.[5] ?? suffix?.[3],
    prefix?.[6] ?? suffix?.[4],
  );
  const currency = currencyCode(prefix?.[1] ?? prefix?.[2] ?? suffix?.[5]);
  if (minimumAmount === undefined || currency === undefined) return undefined;
  return {
    minimumAmount,
    ...(maximumAmount === undefined ? {} : { maximumAmount }),
    currency,
  };
}

function unparseableSalary(
  originalText: string,
  issues: NormalizationIssue[],
): NormalizedSalary {
  issues.push({
    code: 'UNPARSEABLE_SALARY',
    field: 'salary',
    severity: 'WARNING',
    details: 'Explicit salary text could not be parsed without assumptions.',
    evidence: originalText,
  });
  return {
    period: 'UNSPECIFIED',
    grossNet: salaryGrossNet(originalText),
    kind: 'UNKNOWN',
    originalText,
    parsingStatus: 'UNPARSEABLE',
  };
}

function parseSalaryAmount(
  value: string | undefined,
  multiplier: string | undefined = undefined,
): number | undefined {
  if (value === undefined) return undefined;
  const normalized = value
    .replace(/[,.](?=\d{3}(?:\D|$))/gu, '')
    .replace(',', '.');
  const amount = Number(normalized) * (multiplier === undefined ? 1 : 1_000);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function currencyCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === '€') return 'EUR';
  if (value === '$') return 'USD';
  if (value === '£') return 'GBP';
  return value.toUpperCase();
}

function salaryPeriod(value: string | undefined): NormalizedSalary['period'] {
  if (value === undefined) return 'UNSPECIFIED';
  if (/\b(?:hour|hourly|hr)\b/iu.test(value)) return 'HOUR';
  if (/\b(?:day|daily)\b/iu.test(value)) return 'DAY';
  if (/\b(?:week|weekly)\b/iu.test(value)) return 'WEEK';
  if (/\b(?:month|monthly)\b/iu.test(value)) return 'MONTH';
  if (/\b(?:year|annual|annually)\b/iu.test(value)) return 'YEAR';
  if (/\b(?:annum|yr)\b/iu.test(value)) return 'YEAR';
  if (/\bcontract\b/iu.test(value)) return 'CONTRACT';
  return 'UNSPECIFIED';
}

function salaryGrossNet(
  value: string | undefined,
): NormalizedSalary['grossNet'] {
  if (value === undefined) return 'UNSPECIFIED';
  if (/\bgross\b/iu.test(value)) return 'GROSS';
  if (/\bnet\b/iu.test(value)) return 'NET';
  return 'UNSPECIFIED';
}

export function normalizeIdentityUrl(
  value: string,
  removableParameters: readonly string[],
): string | undefined {
  const result = normalizePublicUrlValue(value, {
    removableParameters,
    normalizeTrailingSlash: true,
    sortQueryParameters: true,
  });
  return result.status === 'SUCCESS' ? result.value : undefined;
}

function normalizeLocation(
  input: ProcessableJob,
  issues: NormalizationIssue[],
  extractedRemote: ExtractedRemoteFact | undefined,
): NormalizedLocation {
  const metadataLocation = metadataString(
    input.metadata,
    'locationText',
    2_000,
  );
  const first = input.locations[0];
  const originalText =
    metadataLocation ??
    (first === undefined
      ? undefined
      : [first.city, first.region, first.country].filter(Boolean).join(', '));
  const text = clean(originalText ?? '');
  const policyText = clean(
    [text, extractedRemote?.evidence].filter(Boolean).join(' '),
  );
  const textualPolicy = /\bhybrid\b/iu.test(policyText)
    ? 'hybrid'
    : /\bremote\b/iu.test(policyText)
      ? 'remote'
      : undefined;
  const policy =
    input.remotePolicy ??
    extractedRemote?.value ??
    textualPolicy ??
    'unspecified';
  if (
    input.remotePolicy !== undefined &&
    textualPolicy !== undefined &&
    input.remotePolicy !== textualPolicy
  )
    issues.push({
      code: 'CONFLICTING_REMOTE_POLICY',
      field: 'location',
      severity: 'WARNING',
      details: 'Structured and textual remote policies conflict.',
      evidence: policyText,
    });
  const geographicContext = findGeographicContext(policyText);
  const textualCountry = geographicContext.countryCode;
  const countryCodes = [
    ...input.locations.flatMap((location) => {
      const code = normalizeCountry(location.country);
      return code === undefined ? [] : [code];
    }),
    ...(textualCountry === undefined ? [] : [textualCountry]),
  ].filter((code, index, values) => values.indexOf(code) === index);
  const countryCode = countryCodes[0];
  const remoteScope =
    policy !== 'remote'
      ? 'UNSPECIFIED'
      : extractedRemote?.scope === 'WORLDWIDE' ||
          /\bworldwide|anywhere\b/iu.test(policyText)
        ? 'WORLDWIDE'
        : extractedRemote?.scope === 'EEA' || /\beea\b/iu.test(policyText)
          ? 'EEA'
          : extractedRemote?.scope === 'EU' ||
              /\beu(?:ropean union)?\b/iu.test(policyText)
            ? 'EU'
            : extractedRemote?.scope === 'EUROPE' ||
                /\beurope\b/iu.test(policyText)
              ? 'EUROPE'
              : extractedRemote?.scope === 'TIMEZONE' ||
                  /\b(?:time ?zone|utc[+-])\b/iu.test(policyText)
                ? 'TIMEZONE'
                : countryCode === undefined
                  ? 'UNSPECIFIED'
                  : 'COUNTRY';
  if (
    text.length > 0 &&
    countryCode === undefined &&
    remoteScope === 'UNSPECIFIED'
  )
    issues.push({
      code: 'AMBIGUOUS_LOCATION',
      field: 'location',
      severity: 'WARNING',
      details: 'Location text could not be mapped confidently.',
      evidence: text,
    });
  const region =
    normalizedRegion(first?.region, countryCode) ?? geographicContext.region;
  return {
    ...(originalText === undefined ? {} : { originalText }),
    ...(first?.city === undefined ? {} : { city: clean(first.city) }),
    ...(region === undefined ? {} : { region }),
    ...(countryCode === undefined ? {} : { countryCode }),
    countryCodes,
    remotePolicy: policy,
    remoteScope,
    normalizedKey: [
      policy,
      remoteScope,
      ...normalizedLocationParts(input, text),
    ]
      .join('|')
      .toLocaleLowerCase('en-US'),
  };
}

function normalizedLocationParts(
  input: ProcessableJob,
  fallbackText: string,
): readonly string[] {
  if (input.locations.length === 0)
    return [comparisonKey(fallbackText)].filter((value) => value.length > 0);
  return input.locations
    .map((location) =>
      [
        normalizeCountry(location.country) ?? comparisonKey(location.country),
        comparisonKey(location.region ?? ''),
        comparisonKey(location.city ?? ''),
      ].join(':'),
    )
    .sort();
}

function detectSeniority(
  title: string,
  description: string | undefined,
): { level: SeniorityLevel; evidence: string } | undefined {
  if (/\b(?:director of photography|executive assistant)\b/iu.test(title))
    return undefined;
  const rules: readonly [SeniorityLevel, RegExp][] = [
    [
      'executive',
      /\b(?:chief (?:executive|technology|data|product) officer|c[etdpo]o)\b/iu,
    ],
    ['vp', /\b(?:vice president|vp)\b/iu],
    ['director', /\b(?:managing director|director|head of)\b/iu],
    ['manager', managerSeniorityEvidence(title, description) ?? /$^/u],
    ['principal', /\bprincipal\b/iu],
    ['staff', /\bstaff\b/iu],
    [
      'lead',
      /\b(?:team|technical|engineering|data|product) lead\b|\blead (?:engineer|developer|scientist|architect)\b/iu,
    ],
    ['senior', /\b(?:senior|sr\.?)(?=\s|$)/iu],
    ['entry', /\b(?:junior|jr\.?|entry[- ]level)\b/iu],
    ['intern', /\b(?:intern|internship)\b/iu],
  ];
  for (const [level, pattern] of rules) {
    const match = pattern.exec(title);
    if (match !== null) return { level, evidence: match[0] };
  }
  return undefined;
}

function managerSeniorityEvidence(
  title: string,
  description: string | undefined,
): RegExp | undefined {
  if (
    /\b(?:software\s+)?engineering manager\b|\bpeople manager\b|\bmanager\s*,\s*(?:software\s+)?engineering\b/iu.test(
      title,
    )
  )
    return /\bmanager\b/iu;
  if (!/\bmanager\b/iu.test(title) || description === undefined)
    return undefined;
  return /\b(?:manage|managing|lead|leading) (?:a |an |the )?(?:high[- ]performing )?(?:team|teams|people|employees|engineers|reports)\b|\b(?:(?:people|team|personnel) management(?: experience)?|people manager|direct reports|performance management|manager of managers|hire and (?:coach|develop)|hiring and (?:coaching|developing))\b/iu.test(
    description,
  )
    ? /\bmanager\b/iu
    : undefined;
}

function removeSeniority(
  title: string,
  level: SeniorityLevel | undefined,
): string {
  if (level === undefined) return title;
  const patterns: Partial<Record<SeniorityLevel, RegExp>> = {
    intern: /\b(?:intern|internship)\b/giu,
    entry: /\b(?:junior|jr\.?|entry[- ]level)\b/giu,
    senior: /\b(?:senior|sr\.?)\b/giu,
    staff: /\bstaff\b/giu,
    principal: /\bprincipal\b/giu,
    lead: /\b(?:team|technical|engineering|data|product) lead\b|\blead(?=\s+(?:engineer|developer|scientist|architect))/giu,
    manager: /\bmanager\b/giu,
    director: /\b(?:managing director|director)(?:\s+of)?\b|\bhead of\b/giu,
    vp: /\b(?:vice president|vp)(?:\s+of)?\b/giu,
    executive:
      /\b(?:chief (?:executive|technology|data|product) officer|c[etdpo]o)\b/giu,
  };
  return clean(
    title
      .replace(patterns[level] ?? /$^/u, ' ')
      .replace(/^[-,–—:\s]+|[-,–—:\s]+$/gu, ''),
  );
}

function extractExperience(
  text: string | undefined,
): readonly NormalizedExperienceRequirement[] {
  if (text === undefined) return [];
  const results: NormalizedExperienceRequirement[] = [];
  const upToPattern =
    /([^.!?\n]{0,80}?\bup to\s+(\d{1,2})\s+years?(?:\s+of)?\s+(?:relevant\s+)?experience[^.!?\n]{0,80})/giu;
  for (const match of text.matchAll(upToPattern)) {
    const evidence = clean(match[1] ?? '');
    results.push({
      minimumYears: 0,
      maximumYears: Number(match[2]),
      level: requirementLevel(evidence),
      evidence,
    });
  }
  const pattern =
    /([^.!?\n]{0,80}?\b(?<!up to )(\d{1,2})(?:\s*[–-]\s*(\d{1,2})|\+)?\s+years?(?:\s+of)?\s+(?:relevant\s+)?experience[^.!?\n]{0,80})/giu;
  for (const match of text.matchAll(pattern)) {
    const evidence = clean(match[1] ?? '');
    const level = requirementLevel(evidence);
    results.push({
      minimumYears: Number(match[2]),
      ...(match[3] === undefined ? {} : { maximumYears: Number(match[3]) }),
      level,
      evidence,
    });
  }
  return results;
}

function extractEducation(
  text: string | undefined,
): readonly NormalizedEducationRequirement[] {
  if (text === undefined) return [];
  const results: NormalizedEducationRequirement[] = [];
  const pattern =
    /([^.!?\n]{0,100}\b(?:ph\.?d\.?|doctorate|master'?s?|bachelor'?s?)\b[^.!?\n]{0,100})/giu;
  for (const match of text.matchAll(pattern)) {
    const evidence = clean(match[1] ?? '');
    if (
      !/\b(?:required|must|minimum|preferred|nice to have|degree|qualification)\b/iu.test(
        evidence,
      )
    )
      continue;
    const lowered = evidence.toLocaleLowerCase('en-US');
    const level: EducationLevel = /ph\.?d|doctorate/u.test(lowered)
      ? 'doctorate'
      : /master/u.test(lowered)
        ? 'master'
        : 'bachelor';
    results.push({
      level,
      requirement: requirementLevel(evidence),
      acceptsEquivalentExperience:
        /equivalent (?:professional |work )?experience|or equivalent/iu.test(
          evidence,
        ),
      evidence,
    });
  }
  return results;
}

function extractLanguages(
  text: string | undefined,
  issues: NormalizationIssue[],
): readonly NormalizedLanguageRequirement[] {
  if (text === undefined) return [];
  const results: NormalizedLanguageRequirement[] = [];
  const sentences = text.split(/(?<=[.!?;\n])/u);
  for (const sentence of sentences) {
    if (
      !/\b(?:required|must|fluen|proficien|native|professional|preferred|nice to have|c[12]|b[12]|a[12])\b/iu.test(
        sentence,
      )
    )
      continue;
    for (const [code, name, alias] of LANGUAGE_ALIASES) {
      if (!alias.test(sentence)) continue;
      const proficiency = languageLevel(sentence);
      if (proficiency === undefined) {
        issues.push({
          code: 'UNKNOWN_LANGUAGE_LEVEL',
          field: 'languages',
          severity: 'WARNING',
          details: `An explicit ${name} requirement had no recognized level.`,
          evidence: clean(sentence),
        });
      }
      results.push({
        code,
        name,
        proficiency: proficiency ?? 'basic',
        requirement: requirementLevel(sentence),
        nativeRequired: /\bnative(?:[- ]level| speaker)?\b/iu.test(sentence),
        evidence: clean(sentence),
      });
    }
  }
  return uniqueBy(
    results,
    (item) => `${item.code}|${item.requirement}|${item.proficiency}`,
  );
}

function extractSkills(
  text: string | undefined,
): readonly NormalizedSkillRequirement[] {
  if (text === undefined) return [];
  const results: NormalizedSkillRequirement[] = [];
  for (const [canonicalName, alias] of SKILL_ALIASES) {
    for (const match of text.matchAll(alias)) {
      const start = Math.max(0, match.index - 80);
      const evidence = clean(
        text.slice(
          start,
          Math.min(text.length, match.index + match[0].length + 80),
        ),
      );
      results.push({
        canonicalName,
        originalSpelling: match[0],
        requirement: requirementLevel(evidence),
        evidence,
      });
    }
  }
  return uniqueBy(results, (item) => item.canonicalName);
}

function extractAuthorization(
  text: string | undefined,
): readonly WorkAuthorizationRequirement[] {
  if (text === undefined) return [];
  const sentences = text.split(/(?<=[.!?\n])/u);
  return sentences.flatMap(
    (sentence): readonly WorkAuthorizationRequirement[] => {
      if (
        !/\b(?:authori[sz]ed to work|right to work|(?:visa|immigration|work authorization) sponsorship|sponsorship (?:to work|for (?:a )?visa)|citizens? only|security clearance)\b/iu.test(
          sentence,
        )
      )
        return [];
      const evidence = clean(sentence);
      const countryCode = findCountry(evidence);
      return [
        {
          ...(countryCode === undefined
            ? /\beu\b/iu.test(evidence)
              ? { countryGroup: 'EU' as const }
              : {}
            : { countryCode }),
          sponsorshipAvailable:
            /\bsponsorship (?:is )?available|will sponsor\b/iu.test(evidence)
              ? true
              : /\bno sponsorship|unable to sponsor|without sponsorship\b/iu.test(
                    evidence,
                  )
                ? false
                : 'UNKNOWN',
          citizenshipOnly: /\bcitizens? only\b/iu.test(evidence),
          securityClearanceRequired:
            /\bsecurity clearance (?:is )?required|must (?:hold|obtain) (?:a )?security clearance\b/iu.test(
              evidence,
            ),
          evidence,
        },
      ];
    },
  );
}

function requirementLevel(value: string): RequirementLevel {
  if (/\b(?:preferred|nice to have|desirable|bonus)\b/iu.test(value))
    return 'PREFERRED';
  if (/\boptional\b/iu.test(value)) return 'OPTIONAL';
  if (
    /\b(?:required|must|minimum|need to|proficiency|fluent|native)\b/iu.test(
      value,
    )
  )
    return 'REQUIRED';
  return 'UNKNOWN';
}

function languageLevel(value: string) {
  if (/\bnative/iu.test(value)) return 'native' as const;
  if (/\b(?:c2|fluent)\b/iu.test(value)) return 'fluent' as const;
  if (/\b(?:c1|professional)\b/iu.test(value)) return 'professional' as const;
  if (/\b(?:b1|b2|conversational)\b/iu.test(value))
    return 'conversational' as const;
  if (/\b(?:a1|a2|basic)\b/iu.test(value)) return 'basic' as const;
  return undefined;
}

function normalizeCountry(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = clean(value);
  if (/^[A-Za-z]{2}$/u.test(cleaned)) return cleaned.toUpperCase();
  return COUNTRY_ALIASES[cleaned.toLocaleLowerCase('en-US')];
}

function findGeographicContext(value: string): {
  readonly countryCode?: string;
  readonly region?: string;
} {
  const lowered = value.toLocaleLowerCase('en-US');
  for (const [name, code] of Object.entries(COUNTRY_ALIASES)) {
    if (
      new RegExp(
        `(?:^|[^\\p{L}])${escapeRegExp(name)}(?:$|[^\\p{L}])`,
        'iu',
      ).test(lowered)
    ) {
      const region = findRegion(value, code);
      return {
        countryCode: code,
        ...(region === undefined ? {} : { region }),
      };
    }
  }
  for (const region of NORTH_AMERICAN_REGIONS)
    if (regionPattern(region.code, region.name).test(value))
      return { countryCode: region.countryCode, region: region.name };
  const explicitCode = /\b[A-Z]{2}\b/u.exec(value)?.[0];
  return explicitCode !== undefined && KNOWN_COUNTRY_CODES.has(explicitCode)
    ? { countryCode: explicitCode }
    : {};
}

function findCountry(value: string): string | undefined {
  return findGeographicContext(value).countryCode;
}

function findRegion(value: string, countryCode: string): string | undefined {
  return NORTH_AMERICAN_REGIONS.find(
    (region) =>
      region.countryCode === countryCode &&
      regionPattern(region.code, region.name).test(value),
  )?.name;
}

function normalizedRegion(
  value: string | undefined,
  countryCode: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = clean(value);
  return (
    NORTH_AMERICAN_REGIONS.find(
      (region) =>
        region.countryCode === countryCode &&
        (region.code === cleaned.toUpperCase() ||
          region.name.toLocaleLowerCase('en-US') ===
            cleaned.toLocaleLowerCase('en-US')),
    )?.name ?? cleaned
  );
}

function regionPattern(code: string, name: string): RegExp {
  return new RegExp(
    `[,;\u2022]\\s*${escapeRegExp(code)}(?:$|[,;\\s\u2022])|^${escapeRegExp(code)}(?=\\s*[,;\u2022])|(?:^|[^\\p{L}])${escapeRegExp(name)}(?:$|[^\\p{L}])`,
    'iu',
  );
}

function companyKey(value: string, legalSuffixes: readonly string[]): string {
  let key = comparisonKey(value);
  for (const suffix of legalSuffixes) {
    const normalizedSuffix = comparisonKey(suffix);
    if (key === normalizedSuffix) continue;
    if (key.endsWith(` ${normalizedSuffix}`))
      key = key.slice(0, -(normalizedSuffix.length + 1));
  }
  return key;
}

function comparisonKey(value: string): string {
  return clean(value)
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function clean(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function metadataString(
  metadata:
    Readonly<Record<string, import('./job-posting.js').JsonValue>> | undefined,
  key: string,
  maximumLength = 2_000,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' &&
    clean(value.slice(0, maximumLength)).length > 0
    ? clean(value.slice(0, maximumLength))
    : undefined;
}

function cleanBounded(
  value: string,
  maximumLength: number,
  field: string,
  issues: NormalizationIssue[],
): string {
  if (value.length > maximumLength)
    issues.push({
      code: 'INPUT_TRUNCATED',
      field,
      severity: 'WARNING',
      details: `${field} exceeded ${maximumLength} characters and was truncated.`,
    });
  return clean(value.slice(0, maximumLength));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function uniqueBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  const values = new Map<string, T>();
  for (const item of items)
    if (!values.has(key(item))) values.set(key(item), item);
  return [...values.values()];
}
