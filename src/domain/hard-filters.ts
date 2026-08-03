import type { CandidateProfile } from './candidate-profile.js';
import type { LanguageProficiency, SeniorityLevel } from './categories.js';
import type {
  EnrichedNormalizedJob,
  HardFilterReason,
  HardFilterResult,
} from './job-processing.js';
import type { HardFilterConfiguration } from './search-configuration.js';
import {
  analyzeRoleTitle,
  exactTitleMatches,
  phraseMatches,
} from './role-matching.js';

const EU = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);
const EEA = new Set([...EU, 'IS', 'LI', 'NO']);
const EUROPE = new Set([
  ...EEA,
  'AL',
  'AD',
  'BA',
  'BY',
  'CH',
  'GB',
  'MC',
  'MD',
  'ME',
  'MK',
  'RS',
  'SM',
  'UA',
  'VA',
]);
const SENIORITY_ORDER: readonly SeniorityLevel[] = [
  'intern',
  'entry',
  'mid',
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
  'director',
  'vp',
  'executive',
];
const LANGUAGE_ORDER: readonly LanguageProficiency[] = [
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native',
];

export function evaluateHardFilters(input: {
  readonly job: EnrichedNormalizedJob;
  readonly candidate: CandidateProfile;
  readonly configuration: HardFilterConfiguration;
  readonly processingTime: string;
}): HardFilterResult {
  const reasons = [
    ...countryReasons(input.job, input.configuration),
    ...authorizationReasons(input.job, input.candidate),
    ...languageReasons(input.job, input.candidate, input.configuration),
    ...seniorityReasons(input.job, input.candidate, input.configuration),
    ...experienceReasons(input.job, input.configuration),
    ...phdReasons(input.job, input.candidate, input.configuration),
    ...companyReasons(input.job, input.candidate, input.configuration),
    ...industryReasons(input.job, input.candidate, input.configuration),
    ...titleReasons(input.job, input.configuration),
    ...candidateTitleReasons(input.job, input.candidate),
    ...expiryReasons(input.job, input.processingTime),
  ];
  return reasons.length === 0
    ? { decision: 'ELIGIBLE', reasons: [] }
    : { decision: 'REJECTED', reasons };
}

function candidateTitleReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
): readonly HardFilterReason[] {
  const targets = candidate.targetRoles;
  if (targets === undefined) return [];
  const exact = targets.excludedTitles.find((title) =>
    exactTitleMatches(job.cleanedTitle, title, targets.titleAliases),
  );
  if (exact !== undefined)
    return [
      reason(
        'EXCLUDED_TITLE_EXACT',
        'candidate-title',
        `Candidate profile excludes exact title: ${exact}.`,
        { title: job.cleanedTitle, excludedTitle: exact },
      ),
    ];
  const phrase = targets.excludedTitlePhrases.find((item) =>
    phraseMatches(job.cleanedTitle, item),
  );
  if (phrase !== undefined)
    return [
      reason(
        'EXCLUDED_TITLE_PHRASE',
        'candidate-title',
        `Candidate profile excludes title phrase: ${phrase}.`,
        { title: job.cleanedTitle, excludedPhrase: phrase },
      ),
    ];
  const family = analyzeRoleTitle(
    job.cleanedTitle,
    targets.titleAliases,
  ).families.find((item) => targets.excludedRoleFamilies.includes(item));
  return family === undefined
    ? []
    : [
        reason(
          'EXCLUDED_ROLE_FAMILY',
          'candidate-role-family',
          `Candidate profile excludes role family: ${family}.`,
          { title: job.cleanedTitle, roleFamily: family },
        ),
      ];
}

function countryReasons(
  job: EnrichedNormalizedJob,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  if (
    config.allowedCountries.length === 0 &&
    config.allowedCountryGroups.length === 0
  )
    return [];
  if (job.location.remoteScope === 'WORLDWIDE') return [];
  const scopedCountries = remoteScopeCountries(job.location.remoteScope);
  const allowedCountries = configuredCountries(config);
  if (
    scopedCountries !== undefined &&
    [...scopedCountries].some((country) => allowedCountries.has(country))
  )
    return [];
  const countries = job.location.countryCodes;
  if (countries.length === 0)
    return config.rejectUnknownLocation
      ? [
          reason(
            'COUNTRY_NOT_ALLOWED',
            'country',
            'Job location is unknown and configuration rejects unknown locations.',
            { country: null },
          ),
        ]
      : [];
  if (countries.some((country) => allowedCountries.has(country))) return [];
  return [
    reason(
      'COUNTRY_NOT_ALLOWED',
      'country',
      `Job countries ${countries.join(', ')} are outside the allowed geography.`,
      { country: countries.join(', ') },
    ),
  ];
}

function remoteScopeCountries(
  scope: EnrichedNormalizedJob['location']['remoteScope'],
): ReadonlySet<string> | undefined {
  if (scope === 'EU') return EU;
  if (scope === 'EEA') return EEA;
  if (scope === 'EUROPE') return EUROPE;
  return undefined;
}

function configuredCountries(
  config: HardFilterConfiguration,
): ReadonlySet<string> {
  const countries = new Set(config.allowedCountries);
  for (const group of config.allowedCountryGroups) {
    const members = group === 'EU' ? EU : group === 'EEA' ? EEA : EUROPE;
    for (const country of members) countries.add(country);
  }
  return countries;
}

function authorizationReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
): readonly HardFilterReason[] {
  const authorized = new Set([
    ...candidate.citizenships,
    ...candidate.workAuthorizations
      .filter((item) => item.status !== 'sponsorship-required')
      .map((item) => item.country),
  ]);
  const citizenships = new Set(candidate.citizenships);
  return job.workAuthorizationRequirements.flatMap(
    (requirement): readonly HardFilterReason[] => {
      const countryAllowed =
        requirement.countryCode === undefined ||
        authorized.has(requirement.countryCode);
      const groupAllowed =
        requirement.countryGroup === undefined ||
        [...authorized].some((country) =>
          requirement.countryGroup === 'EU'
            ? EU.has(country)
            : EEA.has(country),
        );
      const citizenshipAllowed =
        !requirement.citizenshipOnly ||
        (requirement.countryCode !== undefined
          ? citizenships.has(requirement.countryCode)
          : requirement.countryGroup !== undefined
            ? [...citizenships].some((country) =>
                requirement.countryGroup === 'EU'
                  ? EU.has(country)
                  : EEA.has(country),
              )
            : false);
      if (
        countryAllowed &&
        groupAllowed &&
        citizenshipAllowed &&
        !requirement.securityClearanceRequired
      )
        return [];
      if (
        requirement.sponsorshipAvailable === true &&
        !requirement.citizenshipOnly &&
        !requirement.securityClearanceRequired
      )
        return [];
      return [
        reason(
          'WORK_AUTHORIZATION_NOT_AVAILABLE',
          'work-authorization',
          'The job has an explicit authorization, citizenship, or clearance requirement not satisfied by the profile.',
          {
            country:
              requirement.countryCode ?? requirement.countryGroup ?? null,
            sponsorshipAvailable: requirement.sponsorshipAvailable === true,
          },
        ),
      ];
    },
  );
}

function languageReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  return job.languageRequirements
    .filter((requirement) => requirement.requirement === 'REQUIRED')
    .flatMap((requirement): readonly HardFilterReason[] => {
      const candidateLanguage = candidate.languages.find(
        (item) => item.code === requirement.code,
      );
      const sufficient =
        candidateLanguage !== undefined &&
        LANGUAGE_ORDER.indexOf(candidateLanguage.proficiency) >=
          LANGUAGE_ORDER.indexOf(requirement.proficiency);
      if (sufficient) return [];
      if (
        candidateLanguage !== undefined ||
        config.unknownCandidateLanguageLevelPolicy === 'reject'
      )
        return [
          reason(
            'MISSING_REQUIRED_LANGUAGE',
            'language',
            `${requirement.name} ${requirement.proficiency} is mandatory and the candidate does not meet it.`,
            {
              language: requirement.name,
              requiredLevel: requirement.proficiency,
              candidateLevel: candidateLanguage?.proficiency ?? null,
            },
          ),
        ];
      return [];
    });
}

function seniorityReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  const configuredMaximum = SENIORITY_ORDER.indexOf(config.maximumSeniority);
  const candidateMaximum = candidate.maximumTargetSeniority;
  const candidateIndex =
    candidateMaximum === undefined
      ? configuredMaximum
      : Math.min(
          SENIORITY_ORDER.length - 1,
          SENIORITY_ORDER.indexOf(candidateMaximum) +
            (candidate.allowSeniorityStretch === true ? 1 : 0),
        );
  const maximumIndex = Math.min(configuredMaximum, candidateIndex);
  if (
    job.seniority === undefined ||
    SENIORITY_ORDER.indexOf(job.seniority) <= maximumIndex
  )
    return [];
  const maximum = SENIORITY_ORDER[maximumIndex] ?? config.maximumSeniority;
  return [
    reason(
      'SENIORITY_EXCEEDS_MAXIMUM',
      'seniority',
      `Detected seniority ${job.seniority} exceeds effective candidate maximum ${maximum}.`,
      { detected: job.seniority, maximum },
    ),
  ];
}

function experienceReasons(
  job: EnrichedNormalizedJob,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  const required = job.experienceRequirements
    .filter((item) => item.level === 'REQUIRED')
    .map((item) => item.minimumYears ?? 0);
  const effective = required.length === 0 ? undefined : Math.max(...required);
  return effective !== undefined &&
    effective > config.maximumRequiredExperienceYears
    ? [
        reason(
          'EXPERIENCE_EXCEEDS_MAXIMUM',
          'experience',
          `Mandatory minimum experience ${effective} years exceeds configured maximum ${config.maximumRequiredExperienceYears}.`,
          {
            requiredYears: effective,
            maximumYears: config.maximumRequiredExperienceYears,
          },
        ),
      ]
    : [];
}

function phdReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  if (
    config.allowMandatoryPhd ||
    candidate.education.some((item) => item.level === 'doctorate')
  )
    return [];
  const requirement = job.educationRequirements.find(
    (item) =>
      item.level === 'doctorate' &&
      item.requirement === 'REQUIRED' &&
      !item.acceptsEquivalentExperience,
  );
  return requirement === undefined
    ? []
    : [
        reason(
          'PHD_REQUIRED',
          'education',
          'A doctorate is explicitly mandatory.',
          { evidence: requirement.evidence },
        ),
      ];
}

function companyReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  const match = [
    ...config.excludedCompanies,
    ...(candidate.careerPreferences?.excludedCompanies ?? []),
  ].find(
    (item) =>
      companyKey(item, config.companyLegalSuffixes) ===
      job.companyComparisonKey,
  );
  return match === undefined
    ? []
    : [
        reason(
          'EXCLUDED_COMPANY',
          'company',
          `Company is explicitly excluded: ${match}.`,
          { company: job.originalCompany },
        ),
      ];
}

function industryReasons(
  job: EnrichedNormalizedJob,
  candidate: CandidateProfile,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  if (job.industry === undefined)
    return config.rejectUnknownIndustry
      ? [
          reason(
            'EXCLUDED_INDUSTRY',
            'industry',
            'Industry is unknown and configuration rejects unknown industries.',
            { industry: null },
          ),
        ]
      : [];
  const match = [
    ...config.excludedIndustries,
    ...(candidate.careerPreferences?.excludedIndustries ?? []),
  ].find((item) => comparisonKey(item) === comparisonKey(job.industry ?? ''));
  return match === undefined
    ? []
    : [
        reason(
          'EXCLUDED_INDUSTRY',
          'industry',
          `Industry is explicitly excluded: ${match}.`,
          { industry: job.industry },
        ),
      ];
}

function titleReasons(
  job: EnrichedNormalizedJob,
  config: HardFilterConfiguration,
): readonly HardFilterReason[] {
  const key = comparisonKey(job.cleanedTitle);
  const match = config.excludedTitlePhrases.find((phrase) => {
    const phraseKey = comparisonKey(phrase);
    return ` ${key} `.includes(` ${phraseKey} `);
  });
  return match === undefined
    ? []
    : [
        reason(
          'EXCLUDED_TITLE_PATTERN',
          'title',
          `Title matched excluded phrase: ${match}.`,
          { title: job.cleanedTitle, pattern: match },
        ),
      ];
}

function expiryReasons(
  job: EnrichedNormalizedJob,
  processingTime: string,
): readonly HardFilterReason[] {
  if (job.expiresAt === undefined) return [];
  const expires = new Date(job.expiresAt).getTime();
  const now = new Date(processingTime).getTime();
  return Number.isFinite(expires) && expires <= now
    ? [
        reason(
          'JOB_EXPIRED',
          'expiration',
          'Job expiration is at or before the processing time.',
          { expiresAt: job.expiresAt, processingTime },
        ),
      ]
    : [];
}

function reason(
  code: HardFilterReason['code'],
  filterId: string,
  details: string,
  evidence?: HardFilterReason['evidence'],
): HardFilterReason {
  return {
    code,
    filterId,
    details,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function comparisonKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function companyKey(value: string, suffixes: readonly string[]): string {
  let key = comparisonKey(value);
  for (const suffix of suffixes) {
    const suffixKey = comparisonKey(suffix);
    if (key.endsWith(` ${suffixKey}`))
      key = key.slice(0, -(suffixKey.length + 1));
  }
  return key;
}
