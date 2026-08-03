import type { JsonValue } from './job-posting.js';
import type {
  DescriptionExtractionStrategy,
  ExtractedBooleanPolicy,
  ExtractedEmploymentFact,
  ExtractedRemoteFact,
  ExtractedTextFact,
  ExtractedTravelRequirement,
  ExtractionProvenance,
  JobDescriptionAnalysis,
  NormalizedEducationRequirement,
  NormalizedExperienceRequirement,
  NormalizedLanguageRequirement,
  NormalizedSkillRequirement,
  RemoteScope,
  RequirementLevel,
  TechnologyCategory,
  WorkAuthorizationRequirement,
} from './job-processing.js';
import type {
  EducationLevel,
  EmploymentType,
  LanguageProficiency,
  RemotePolicy,
} from './categories.js';

const MAX_DESCRIPTION_CHARS = 100_000;
const MAX_LINES = 2_000;
const MAX_FACTS_PER_GROUP = 60;
const MAX_EVIDENCE_CHARS = 500;

type SectionKind =
  | 'RESPONSIBILITIES'
  | 'REQUIRED'
  | 'PREFERRED'
  | 'NICE_TO_HAVE'
  | 'BENEFITS'
  | 'COMPENSATION'
  | 'WORK_ARRANGEMENT'
  | 'ABOUT'
  | 'OTHER';

interface Segment {
  readonly text: string;
  readonly source: string;
  readonly section: SectionKind;
  readonly structured: boolean;
  readonly bullet: boolean;
}

interface TechnologyRule {
  readonly canonicalName: string;
  readonly category: TechnologyCategory;
  readonly pattern: RegExp;
}

const SECTION_RULES: readonly {
  readonly section: SectionKind;
  readonly pattern: RegExp;
}[] = [
  {
    section: 'RESPONSIBILITIES',
    pattern:
      /^(?:what you(?:'|\u2019)ll do(?: at .+)?|what you will do(?: at .+)?|you will)$/iu,
  },
  {
    section: 'PREFERRED',
    pattern:
      /^while (?:it(?:'|\u2019)s )?not required,? (?:it(?:'|\u2019)s )?(?:an? )?(?:added )?plus if you (?:also )?have$/iu,
  },
  {
    section: 'REQUIRED',
    pattern:
      /^(?:what we(?:'|\u2019)d like to see|we(?:'|\u2019)d love to hear from you if you have|you have)$/iu,
  },
  {
    section: 'COMPENSATION',
    pattern: /^annual base salary range$/iu,
  },
  {
    section: 'RESPONSIBILITIES',
    pattern:
      /^(?:responsibilities|what you(?:'|’)?ll do|what you will do|your impact|the role|day to day|how you(?:'|’)?ll contribute)$/iu,
  },
  {
    section: 'NICE_TO_HAVE',
    pattern:
      /^(?:nice to have|nice-to-have|bonus points|bonus skills|additional skills|it would be great if)$/iu,
  },
  {
    section: 'PREFERRED',
    pattern:
      /^(?:preferred qualifications?|preferred experience|desirable|ideally|what would set you apart)$/iu,
  },
  {
    section: 'REQUIRED',
    pattern:
      /^(?:requirements?|required qualifications?|minimum qualifications?|must haves?|essential skills?|what you(?:'|’)?ll bring|what you will bring|what we(?:'|’)?re looking for|about you|your background|qualifications?)$/iu,
  },
  {
    section: 'BENEFITS',
    pattern:
      /^(?:benefits|benefits and perks|perks|what we offer|why join us|rewards|our offer)$/iu,
  },
  {
    section: 'COMPENSATION',
    pattern: /^(?:compensation|salary|pay range|remuneration)$/iu,
  },
  {
    section: 'WORK_ARRANGEMENT',
    pattern:
      /^(?:work arrangement|working arrangements?|location|workplace|ways of working)$/iu,
  },
  {
    section: 'ABOUT',
    pattern: /^(?:about us|about the company|who we are|company overview)$/iu,
  },
];

const TECHNOLOGY_RULES: readonly TechnologyRule[] = [
  technology('TypeScript', 'PROGRAMMING_LANGUAGE', /\btypescript\b/giu),
  technology('JavaScript', 'PROGRAMMING_LANGUAGE', /\bjavascript\b/giu),
  technology('Python', 'PROGRAMMING_LANGUAGE', /\bpython\b/giu),
  technology('Java', 'PROGRAMMING_LANGUAGE', /\bjava\b(?!script)/giu),
  technology('Kotlin', 'PROGRAMMING_LANGUAGE', /\bkotlin\b/giu),
  technology(
    'Go',
    'PROGRAMMING_LANGUAGE',
    /\bGo\b(?![- ]to[- ][Mm]arket)|\b(?:golang|go language)\b/gu,
  ),
  technology('Rust', 'PROGRAMMING_LANGUAGE', /\bRust\b|\brust language\b/gu),
  technology(
    'C#',
    'PROGRAMMING_LANGUAGE',
    /(?<![\p{L}\p{N}])C#(?![\p{L}\p{N}])/gu,
  ),
  technology(
    'C++',
    'PROGRAMMING_LANGUAGE',
    /(?<![\p{L}\p{N}])C\+\+(?![\p{L}\p{N}])/gu,
  ),
  technology('Ruby', 'PROGRAMMING_LANGUAGE', /\bruby\b/giu),
  technology('PHP', 'PROGRAMMING_LANGUAGE', /\bphp\b/giu),
  technology('Swift', 'PROGRAMMING_LANGUAGE', /\bSwift\b|\bswift language\b/gu),
  technology('Scala', 'PROGRAMMING_LANGUAGE', /\bscala\b/giu),
  technology(
    'R',
    'PROGRAMMING_LANGUAGE',
    /(?<![\p{L}\p{N}_])R(?![\p{L}\p{N}_])/gu,
  ),
  technology('SQL', 'PROGRAMMING_LANGUAGE', /\bsql\b/giu),
  technology(
    'Shell',
    'PROGRAMMING_LANGUAGE',
    /\b(?:bash|shell scripting)\b/giu,
  ),
  technology('React', 'FRAMEWORK', /\breact(?:\.js|js)?\b/giu),
  technology('Angular', 'FRAMEWORK', /\bangular\b/giu),
  technology('Vue.js', 'FRAMEWORK', /\bvue(?:\.js|js)?\b/giu),
  technology('Next.js', 'FRAMEWORK', /\bnext(?:\.js|js)\b/giu),
  technology('Node.js', 'FRAMEWORK', /\bnode(?:\.js|js)?\b/giu),
  technology('Express', 'FRAMEWORK', /\bexpress(?:\.js|js)?\b/giu),
  technology('NestJS', 'FRAMEWORK', /\bnest(?:\.js|js)?\b/giu),
  technology('Django', 'FRAMEWORK', /\bdjango\b/giu),
  technology('Flask', 'FRAMEWORK', /\bflask\b/giu),
  technology('FastAPI', 'FRAMEWORK', /\bfastapi\b/giu),
  technology('Spring', 'FRAMEWORK', /\bspring(?: boot)?\b/giu),
  technology('.NET', 'FRAMEWORK', /(?<![\p{L}\p{N}])\.NET\b/giu),
  technology('Ruby on Rails', 'FRAMEWORK', /\b(?:ruby on rails|rails)\b/giu),
  technology('Laravel', 'FRAMEWORK', /\blaravel\b/giu),
  technology('AWS', 'CLOUD_PROVIDER', /\b(?:aws|amazon web services)\b/giu),
  technology('Azure', 'CLOUD_PROVIDER', /\b(?:microsoft )?azure\b/giu),
  technology(
    'Google Cloud',
    'CLOUD_PROVIDER',
    /\b(?:gcp|google cloud(?: platform)?)\b/giu,
  ),
  technology('PostgreSQL', 'DATABASE', /\b(?:postgres|postgresql)\b/giu),
  technology('MySQL', 'DATABASE', /\bmysql\b/giu),
  technology('SQL Server', 'DATABASE', /\b(?:microsoft )?sql server\b/giu),
  technology('Oracle Database', 'DATABASE', /\boracle(?: database| db)?\b/giu),
  technology('MongoDB', 'DATABASE', /\bmongodb\b/giu),
  technology('Redis', 'DATABASE', /\bredis\b/giu),
  technology('DynamoDB', 'DATABASE', /\bdynamodb\b/giu),
  technology('Elasticsearch', 'DATABASE', /\belasticsearch\b/giu),
  technology('Snowflake', 'DATABASE', /\bsnowflake\b/giu),
  technology('BigQuery', 'DATABASE', /\bbigquery\b/giu),
  technology('Cassandra', 'DATABASE', /\bcassandra\b/giu),
  technology('Docker', 'PLATFORM', /\bdocker\b/giu),
  technology('Kubernetes', 'PLATFORM', /\b(?:kubernetes|k8s)\b/giu),
  technology('Terraform', 'PLATFORM', /\bterraform\b/giu),
  technology('Kafka', 'PLATFORM', /\b(?:apache )?kafka\b/giu),
  technology('Spark', 'PLATFORM', /\b(?:apache )?spark\b/giu),
  technology('Airflow', 'PLATFORM', /\b(?:apache )?airflow\b/giu),
  technology('dbt', 'PLATFORM', /(?<![\p{L}\p{N}])dbt(?![\p{L}\p{N}])/giu),
  technology('Git', 'PLATFORM', /\bgit\b/giu),
  technology('Linux', 'PLATFORM', /\blinux\b/giu),
  technology('GraphQL', 'PROTOCOL', /\bgraphql\b/giu),
  technology('REST', 'PROTOCOL', /\brest(?:ful)?(?: apis?)?\b/giu),
  technology('gRPC', 'PROTOCOL', /\bgrpc\b/giu),
  technology(
    'CI/CD',
    'PRACTICE',
    /\bci\s*\/\s*cd\b|\bcontinuous (?:integration|delivery|deployment)\b/giu,
  ),
  technology('Machine Learning', 'PRACTICE', /\bmachine learning\b/giu),
  technology('Data Engineering', 'PRACTICE', /\bdata engineering\b/giu),
  technology('Microservices', 'PRACTICE', /\bmicroservices?\b/giu),
  technology('DevOps', 'PRACTICE', /\bdevops\b/giu),
  technology('MLOps', 'PRACTICE', /\bmlops\b/giu),
  technology('Data Science', 'PRACTICE', /\bdata science\b/giu),
  technology('Data Analysis', 'PRACTICE', /\bdata analys(?:is|tics)\b/giu),
  technology('Agile', 'PRACTICE', /\bagile\b/giu),
  technology('Scrum', 'PRACTICE', /\bscrum\b/giu),
  technology('Project Management', 'PRACTICE', /\bproject management\b/giu),
  technology('Product Management', 'PRACTICE', /\bproduct management\b/giu),
  technology(
    'People Leadership',
    'PRACTICE',
    /\b(?:people leadership|team leadership|people management)\b/giu,
  ),
  technology(
    'Stakeholder Management',
    'PRACTICE',
    /\bstakeholder management\b/giu,
  ),
  technology('UX Design', 'PRACTICE', /\b(?:ux|user experience) design\b/giu),
  technology(
    'Frontend Development',
    'PRACTICE',
    /\b(?:technical front[- ]end knowledge|front[- ]end development)\b/giu,
  ),
  technology(
    'Production-quality Code',
    'PRACTICE',
    /\bproduction[- ]quality code\b/giu,
  ),
  technology('Technical Content', 'PRACTICE', /\btechnical content\b/giu),
  technology(
    'Product Development Workflows',
    'PRACTICE',
    /\bproduct[- ]development workflows?\b/giu,
  ),
  technology('Design Systems', 'PRACTICE', /\bdesign systems?\b/giu),
  technology('Figma API', 'PLATFORM', /\bfigma api\b/giu),
  technology('Figma Plugins', 'PLATFORM', /\bfigma\)?\s+plugins?\b/giu),
  technology(
    'Written and Verbal Communication',
    'PRACTICE',
    /\bwritten and verbal communications?\b/giu,
  ),
  technology('Community Building', 'PRACTICE', /\bcommunity building\b/giu),
];

const LANGUAGE_RULES = [
  language('en', 'English', /\benglish\b/iu),
  language('de', 'German', /\b(?:german|deutsch)\b/iu),
  language('fr', 'French', /\b(?:french|fran[cç]ais)\b/iu),
  language('es', 'Spanish', /\b(?:spanish|espa[nñ]ol)\b/iu),
  language('it', 'Italian', /\bitalian\b/iu),
  language('pt', 'Portuguese', /\bportuguese\b/iu),
  language('nl', 'Dutch', /\b(?:dutch|nederlands)\b/iu),
  language('pl', 'Polish', /\bpolish\b/iu),
  language('sv', 'Swedish', /\bswedish\b/iu),
  language('da', 'Danish', /\bdanish\b/iu),
  language('no', 'Norwegian', /\bnorwegian\b/iu),
  language('fi', 'Finnish', /\bfinnish\b/iu),
  language('cs', 'Czech', /\bczech\b/iu),
  language('ja', 'Japanese', /\bjapanese\b/iu),
  language('zh', 'Chinese', /\b(?:chinese|mandarin)\b/iu),
] as const;

const EMPTY_ANALYSIS: JobDescriptionAnalysis = {
  technologyRequirements: [],
  experienceRequirements: [],
  educationRequirements: [],
  languageRequirements: [],
  workAuthorizationRequirements: [],
  certifications: [],
  benefits: [],
  responsibilities: [],
  requiredQualifications: [],
  preferredQualifications: [],
  niceToHaveQualifications: [],
  employmentTypes: [],
  contractTypes: [],
  remotePolicies: [],
  travelRequirements: [],
  salaryMentions: [],
  visaSponsorship: [],
  securityClearance: [],
  relocationSupport: [],
};

export function analyzeJobDescription(
  description: string | undefined,
  metadata?: Readonly<Record<string, JsonValue>>,
): JobDescriptionAnalysis {
  const segments = [
    ...structuredSegments(metadata),
    ...segmentDescription(description),
  ];
  if (segments.length === 0) return EMPTY_ANALYSIS;

  const technologyRequirements = extractTechnologies(segments);
  const experienceRequirements = extractExperience(segments);
  const educationRequirements = extractEducation(segments);
  const languageRequirements = extractLanguages(segments);
  const policies = extractPolicies(segments);
  const sectionFacts = extractSectionFacts(segments);
  return {
    technologyRequirements,
    experienceRequirements,
    educationRequirements,
    languageRequirements,
    workAuthorizationRequirements: policies.authorization,
    certifications: extractCertifications(segments),
    benefits: extractBenefits(segments, sectionFacts.benefits),
    responsibilities: sectionFacts.responsibilities,
    requiredQualifications: sectionFacts.required,
    preferredQualifications: sectionFacts.preferred,
    niceToHaveQualifications: sectionFacts.niceToHave,
    employmentTypes: policies.employmentTypes,
    contractTypes: policies.contractTypes,
    remotePolicies: policies.remote,
    travelRequirements: policies.travel,
    salaryMentions: extractSalaryMentions(segments),
    visaSponsorship: policies.visa,
    securityClearance: policies.clearance,
    relocationSupport: policies.relocation,
  };
}

function segmentDescription(
  description: string | undefined,
): readonly Segment[] {
  if (description === undefined) return [];
  const lines = description
    .slice(0, MAX_DESCRIPTION_CHARS)
    .replace(/\r/gu, '')
    .split('\n')
    .slice(0, MAX_LINES);
  const segments: Segment[] = [];
  let section: SectionKind = 'OTHER';
  let source = 'Description';
  let sectionHasBullets = false;
  for (const rawLine of lines) {
    const bullet = /^\s*(?:[-*•◦▪]|\d+[.)])\s+/u.test(rawLine);
    const line = clean(rawLine.replace(/^\s*(?:[-*•◦▪]|\d+[.)])\s+/u, ' '));
    if (line.length === 0) continue;
    const heading = classifyHeading(line.replace(/:$/u, ''));
    if (heading !== undefined && line.length <= 100) {
      section = heading;
      source = line.replace(/:$/u, '');
      sectionHasBullets = false;
      continue;
    }
    const labeled = /^([^:]{2,80}):\s+(.+)$/u.exec(line);
    const labeledSection = classifyHeading(labeled?.[1] ?? '');
    if (labeled !== null && labeledSection !== undefined) {
      section = labeledSection;
      source = clean(labeled[1] ?? 'Description');
      sectionHasBullets = false;
      pushSentences(segments, labeled[2] ?? '', source, section, false, true);
      continue;
    }
    if (!bullet && sectionHasBullets) {
      section = 'OTHER';
      source = 'Description';
      sectionHasBullets = false;
    }
    pushSentences(segments, line, source, section, false, bullet);
    if (bullet) sectionHasBullets = true;
  }
  return uniqueBy(segments, (item) => `${item.source}|${item.text}`);
}

function structuredSegments(
  metadata: Readonly<Record<string, JsonValue>> | undefined,
): readonly Segment[] {
  const structured = metadata?.['structuredJobData'];
  if (!isJsonObject(structured)) return [];
  const mapping: readonly [string, SectionKind][] = [
    ['skills', 'REQUIRED'],
    ['qualifications', 'REQUIRED'],
    ['experienceRequirements', 'REQUIRED'],
    ['educationRequirements', 'REQUIRED'],
    ['responsibilities', 'RESPONSIBILITIES'],
    ['jobBenefits', 'BENEFITS'],
    ['incentiveCompensation', 'COMPENSATION'],
  ];
  const segments: Segment[] = [];
  for (const [key, section] of mapping)
    for (const text of jsonStrings(structured[key]))
      pushSentences(segments, text, `json-ld.${key}`, section, true, false);
  return uniqueBy(segments, (item) => `${item.source}|${item.text}`);
}

function pushSentences(
  output: Segment[],
  value: string,
  source: string,
  section: SectionKind,
  structured: boolean,
  bullet: boolean,
): void {
  const text = clean(value).slice(0, MAX_EVIDENCE_CHARS * 4);
  if (text.length === 0) return;
  const pieces = text.split(/(?<=[.!?;])\s+/u).filter(Boolean);
  for (const piece of pieces.slice(0, 30))
    output.push({
      text: clean(piece).slice(0, MAX_EVIDENCE_CHARS),
      source,
      section,
      structured,
      bullet,
    });
}

function extractTechnologies(
  segments: readonly Segment[],
): readonly NormalizedSkillRequirement[] {
  const results: NormalizedSkillRequirement[] = [];
  for (const segment of segments) {
    if (segment.section === 'ABOUT' || segment.section === 'BENEFITS') continue;
    for (const rule of TECHNOLOGY_RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(segment.text);
      if (match === null || isNegatedRequirement(segment.text, match[0]))
        continue;
      results.push({
        canonicalName: rule.canonicalName,
        originalSpelling: match[0],
        requirement: requirementLevel(segment),
        evidence: segment.text,
        category: rule.category,
        extraction: provenance(segment, 'TechnologyDictionary'),
      });
    }
  }
  return preferStrongest(
    results,
    (item) => item.canonicalName,
    (item) =>
      requirementStrength(item.requirement) * 10 +
      (item.extraction?.confidence ?? 0),
  );
}

function requirementStrength(requirement: RequirementLevel): number {
  if (requirement === 'REQUIRED') return 3;
  if (requirement === 'PREFERRED') return 2;
  if (requirement === 'OPTIONAL') return 1;
  return 0;
}

function extractExperience(
  segments: readonly Segment[],
): readonly NormalizedExperienceRequirement[] {
  const results: NormalizedExperienceRequirement[] = [];
  const number =
    '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
  const patterns = [
    new RegExp(`up to\\s+${number}\\s+years?`, 'iu'),
    new RegExp(
      `(?:at least|minimum(?: of)?|more than|over)\\s+${number}\\+?\\s+years?`,
      'iu',
    ),
    new RegExp(`${number}\\s*(?:[-–—]|to)\\s*${number}\\s+years?`, 'iu'),
    new RegExp(`${number}\\+\\s+years?`, 'iu'),
    new RegExp(`${number}\\s+years?(?:['’]s)?(?:\\s+of)?`, 'iu'),
  ];
  for (const segment of segments) {
    if (!/\byears?\b/iu.test(segment.text)) continue;
    if (
      !isQualificationSection(segment.section) &&
      !/\b(?:experience|professional|work(?:ing)?|engineering|development|industry|practice|technical|front[- ]?end|back[- ]?end|knowledge|background)\b/iu.test(
        segment.text,
      )
    )
      continue;
    for (const [index, pattern] of patterns.entries()) {
      const match = pattern.exec(segment.text);
      if (match === null) continue;
      const values = match
        .slice(1)
        .map(parseNumberWord)
        .filter((value): value is number => value !== undefined);
      const first = values[0];
      if (first === undefined) continue;
      const upTo = index === 0;
      const range = index === 2 && values[1] !== undefined;
      results.push({
        minimumYears: upTo ? 0 : first,
        ...(upTo
          ? { maximumYears: first }
          : range
            ? { maximumYears: values[1] }
            : {}),
        level: requirementLevel(segment),
        evidence: segment.text,
        extraction: provenance(segment, 'RegexYears'),
      });
      break;
    }
  }
  return uniqueBy(
    results,
    (item) => `${item.minimumYears}|${item.maximumYears ?? ''}|${item.level}`,
  );
}

function extractEducation(
  segments: readonly Segment[],
): readonly NormalizedEducationRequirement[] {
  const rules: readonly [EducationLevel, RegExp][] = [
    ['doctorate', /\b(?:ph\.?d\.?|doctorate|doctoral degree)\b/iu],
    ['master', /\b(?:master(?:'|’)?s?|msc|m\.sc\.)\b/iu],
    [
      'bachelor',
      /\b(?:bachelor(?:'|’)?s?|bsc|b\.sc\.|undergraduate degree)\b/iu,
    ],
    ['vocational', /\b(?:vocational|trade school|apprenticeship)\b/iu],
    ['secondary', /\b(?:high school diploma|secondary education|ged)\b/iu],
  ];
  const results: NormalizedEducationRequirement[] = [];
  for (const segment of segments) {
    for (const [level, pattern] of rules) {
      if (!pattern.test(segment.text)) continue;
      if (
        segment.section === 'ABOUT' ||
        (!isQualificationSection(segment.section) &&
          !/\b(?:degree|required|minimum|preferred|qualification|equivalent)\b/iu.test(
            segment.text,
          ))
      )
        continue;
      results.push({
        level,
        requirement: requirementLevel(segment),
        acceptsEquivalentExperience:
          /\b(?:or equivalent|equivalent (?:professional |work )?experience)\b/iu.test(
            segment.text,
          ),
        evidence: segment.text,
        extraction: provenance(segment, 'RegexEducation'),
      });
    }
  }
  return preferStrongest(
    results,
    (item) => item.level,
    (item) => item.extraction?.confidence ?? 0,
  );
}

function extractLanguages(
  segments: readonly Segment[],
): readonly NormalizedLanguageRequirement[] {
  const results: NormalizedLanguageRequirement[] = [];
  for (const segment of segments) {
    if (
      !isQualificationSection(segment.section) &&
      !/\b(?:language|speak|written|verbal|fluen|proficien|native|business level|c[12]|b[12]|a[12])\b/iu.test(
        segment.text,
      )
    )
      continue;
    for (const rule of LANGUAGE_RULES) {
      const match = rule.pattern.exec(segment.text);
      if (match === null) continue;
      results.push({
        code: rule.code,
        name: rule.name,
        proficiency: languageLevel(segment.text),
        requirement: languageRequirement(segment, match.index),
        nativeRequired: /\bnative(?:[- ]level| speaker)?\b/iu.test(
          segment.text,
        ),
        evidence: segment.text,
        extraction: provenance(segment, 'RegexLanguage'),
      });
    }
  }
  return preferStrongest(
    results,
    (item) => item.code,
    (item) => item.extraction?.confidence ?? 0,
  );
}

function extractCertifications(
  segments: readonly Segment[],
): readonly ExtractedTextFact[] {
  return factMatches(
    segments,
    /\b(?:certification|certified|pmp|cissp|cisa|cka|ckad|aws certified|azure certification|google cloud certification|cpa|acca)\b/iu,
    'RegexPolicy',
  );
}

function extractSectionFacts(segments: readonly Segment[]): {
  readonly benefits: readonly ExtractedTextFact[];
  readonly responsibilities: readonly ExtractedTextFact[];
  readonly required: readonly ExtractedTextFact[];
  readonly preferred: readonly ExtractedTextFact[];
  readonly niceToHave: readonly ExtractedTextFact[];
} {
  return {
    benefits: factsForSection(segments, 'BENEFITS'),
    responsibilities: factsForSection(segments, 'RESPONSIBILITIES'),
    required: factsForSection(segments, 'REQUIRED'),
    preferred: factsForSection(segments, 'PREFERRED'),
    niceToHave: factsForSection(segments, 'NICE_TO_HAVE'),
  };
}

function extractBenefits(
  segments: readonly Segment[],
  sectionBenefits: readonly ExtractedTextFact[],
): readonly ExtractedTextFact[] {
  return uniqueFacts([
    ...sectionBenefits,
    ...factMatches(
      segments,
      /\b(?:offers?|provides?)\b[^.!?]{0,160}\b(?:employee )?benefits?\b|\bhealth, dental, and vision coverage\b|\bretirement benefits with company contributions\b|\bparental leave\b|\bpaid time off\b/iu,
      'RegexPolicy',
    ),
  ]);
}

function extractSalaryMentions(
  segments: readonly Segment[],
): readonly ExtractedTextFact[] {
  const facts = factMatches(
    segments,
    /(?:(?:\b(?:EUR|USD|GBP|CHF|CAD|AUD)\b|[€$£])\s*[\d,.]+\s*[kK]?(?:\s*(?:[-–—]|to)\s*(?:\b(?:EUR|USD|GBP|CHF|CAD|AUD)\b|[€$£])?\s*[\d,.]+\s*[kK]?)?|[\d,.]+\s*[kK]?(?:\s*(?:[-–—]|to)\s*[\d,.]+\s*[kK]?)?\s*\b(?:EUR|USD|GBP|CHF|CAD|AUD)\b)/iu,
    'RegexCompensation',
  );
  return facts.map((fact) => {
    if (!/\bannual\b/iu.test(fact.extraction.source)) return fact;
    const value = `${fact.extraction.source}: ${fact.value}`;
    return { ...fact, value, evidence: value };
  });
}

function extractPolicies(segments: readonly Segment[]): {
  readonly authorization: readonly WorkAuthorizationRequirement[];
  readonly employmentTypes: readonly ExtractedEmploymentFact[];
  readonly contractTypes: readonly ExtractedTextFact[];
  readonly remote: readonly ExtractedRemoteFact[];
  readonly travel: readonly ExtractedTravelRequirement[];
  readonly visa: readonly ExtractedBooleanPolicy[];
  readonly clearance: readonly ExtractedBooleanPolicy[];
  readonly relocation: readonly ExtractedBooleanPolicy[];
} {
  const authorization: WorkAuthorizationRequirement[] = [];
  const employmentTypes: ExtractedEmploymentFact[] = [];
  const contractTypes: ExtractedTextFact[] = [];
  const remote: ExtractedRemoteFact[] = [];
  const travel: ExtractedTravelRequirement[] = [];
  const visa: ExtractedBooleanPolicy[] = [];
  const clearance: ExtractedBooleanPolicy[] = [];
  const relocation: ExtractedBooleanPolicy[] = [];
  for (const segment of segments) {
    const evidence = segment.text;
    const extraction = provenance(segment, 'RegexPolicy');
    if (
      /\b(?:authori[sz]ed to work|right to work|eligible to work|permitted to work|work permit|citizens? only|(?:visa|immigration|work authorization) sponsorship|sponsorship (?:to work|for (?:a )?visa))\b/iu.test(
        evidence,
      )
    ) {
      const sponsorshipAvailable = policyValue(
        evidence,
        /\b(?:visa )?sponsorship (?:is )?(?:available|provided)|\b(?:we |company )?will sponsor\b/iu,
        /\b(?:no|without|unable to provide|cannot provide|do not offer) (?:visa )?sponsorship\b|\b(?:cannot|unable to|do not) sponsor (?:a )?visa|\bmust not require sponsorship\b/iu,
      );
      const authorizationCountry = countryCode(evidence);
      authorization.push({
        ...(authorizationCountry === undefined
          ? /\b(?:eu|european union)\b/iu.test(evidence)
            ? { countryGroup: 'EU' as const }
            : {}
          : { countryCode: authorizationCountry }),
        sponsorshipAvailable,
        citizenshipOnly: /\bcitizens? only\b/iu.test(evidence),
        securityClearanceRequired:
          /\b(?:security |government )?clearance\b/iu.test(evidence),
        evidence,
        extraction,
      });
      if (
        /\b(?:(?:visa|immigration|work authorization) sponsor(?:ship)?|sponsorship (?:to work|for (?:a )?visa))\b/iu.test(
          evidence,
        )
      )
        visa.push({ value: sponsorshipAvailable, evidence, extraction });
    }
    if (
      /\b(?:security clearance|government clearance|secret clearance|top secret|public trust)\b/iu.test(
        evidence,
      )
    )
      clearance.push({
        value: !/\b(?:not required|no clearance required)\b/iu.test(evidence),
        evidence,
        extraction,
      });
    if (/\brelocat(?:e|ion|ing)\b/iu.test(evidence))
      relocation.push({
        value: policyValue(
          evidence,
          /\b(?:relocation (?:support|assistance|package)|we (?:will |can )?relocate|relocation available)\b/iu,
          /\b(?:no relocation|relocation (?:is )?not (?:available|provided))\b/iu,
        ),
        evidence,
        extraction,
      });
    const employment = employmentType(evidence);
    if (employment !== undefined)
      employmentTypes.push({ value: employment, evidence, extraction });
    if (
      /\b(?:permanent|fixed[- ]term|freelance|contractor|temporary|zero[- ]hours)\b/iu.test(
        evidence,
      )
    )
      contractTypes.push(textFact(segment, 'RegexPolicy'));
    const remotePolicy = remotePolicyValue(evidence);
    const scope = remoteScope(evidence);
    if (remotePolicy !== undefined)
      remote.push({
        value: remotePolicy,
        ...(scope === undefined ? {} : { scope }),
        evidence,
        extraction,
      });
    if (/\btravel\b/iu.test(evidence)) {
      const percentage =
        /\b(?:up to |approximately |about )?(\d{1,3})\s*%\s*travel\b/iu.exec(
          evidence,
        )?.[1];
      travel.push({
        required: !/\b(?:no travel|travel (?:is )?not required)\b/iu.test(
          evidence,
        ),
        ...(percentage === undefined
          ? {}
          : { maximumPercentage: Number(percentage) }),
        evidence,
        extraction,
      });
    }
  }
  return {
    authorization: uniqueBy(authorization, (item) => item.evidence),
    employmentTypes: uniqueBy(employmentTypes, (item) => item.value),
    contractTypes: uniqueFacts(contractTypes),
    remote: uniqueBy(remote, (item) => `${item.value}|${item.scope ?? ''}`),
    travel: uniqueBy(travel, (item) => item.evidence),
    visa: uniqueBy(visa, (item) => `${String(item.value)}|${item.evidence}`),
    clearance: uniqueBy(
      clearance,
      (item) => `${String(item.value)}|${item.evidence}`,
    ),
    relocation: uniqueBy(
      relocation,
      (item) => `${String(item.value)}|${item.evidence}`,
    ),
  };
}

function factsForSection(
  segments: readonly Segment[],
  section: SectionKind,
): readonly ExtractedTextFact[] {
  return uniqueFacts(
    segments
      .filter((segment) => segment.section === section)
      .map((segment) => textFact(segment, 'SemanticSection')),
  );
}

function factMatches(
  segments: readonly Segment[],
  pattern: RegExp,
  strategy: DescriptionExtractionStrategy,
): readonly ExtractedTextFact[] {
  return uniqueFacts(
    segments
      .filter((segment) => pattern.test(segment.text))
      .map((segment) => textFact(segment, strategy)),
  );
}

function textFact(
  segment: Segment,
  strategy: DescriptionExtractionStrategy,
): ExtractedTextFact {
  return {
    value: segment.text,
    requirement: requirementLevel(segment),
    evidence: segment.text,
    extraction: provenance(segment, strategy),
  };
}

function provenance(
  segment: Segment,
  strategy: DescriptionExtractionStrategy,
): ExtractionProvenance {
  return {
    source: segment.source,
    strategy: segment.structured
      ? 'StructuredData'
      : strategy === 'SemanticSection' && segment.bullet
        ? 'BulletPattern'
        : strategy,
    confidence: segment.structured
      ? 0.98
      : segment.section !== 'OTHER' && segment.section !== 'ABOUT'
        ? segment.bullet
          ? 0.9
          : 0.86
        : segment.bullet
          ? 0.8
          : 0.72,
  };
}

function requirementLevel(segment: Segment): RequirementLevel {
  if (segment.section === 'PREFERRED' || segment.section === 'NICE_TO_HAVE')
    return 'PREFERRED';
  if (segment.section === 'REQUIRED') return 'REQUIRED';
  if (
    /\b(?:nice to have|preferred|desirable|ideally|bonus)\b/iu.test(
      segment.text,
    )
  )
    return 'PREFERRED';
  if (/\boptional\b/iu.test(segment.text)) return 'OPTIONAL';
  if (
    /\b(?:required|must|minimum|need to|expected to|essential|proficien|fluent|native)\b/iu.test(
      segment.text,
    )
  )
    return 'REQUIRED';
  return 'UNKNOWN';
}

function classifyHeading(value: string): SectionKind | undefined {
  const normalized = clean(value);
  return SECTION_RULES.find((rule) => rule.pattern.test(normalized))?.section;
}

function isQualificationSection(value: SectionKind): boolean {
  return (
    value === 'REQUIRED' || value === 'PREFERRED' || value === 'NICE_TO_HAVE'
  );
}

function languageLevel(value: string): LanguageProficiency {
  if (/\bnative/iu.test(value)) return 'native';
  if (/\b(?:c2|fluent|fluency)\b/iu.test(value)) return 'fluent';
  if (
    /\b(?:c1|professional|business level|business proficiency)\b/iu.test(value)
  )
    return 'professional';
  if (/\b(?:b1|b2|conversational|intermediate)\b/iu.test(value))
    return 'conversational';
  return 'basic';
}

function languageRequirement(
  segment: Segment,
  languageIndex: number,
): RequirementLevel {
  const localEvidence = segment.text.slice(
    Math.max(0, languageIndex - 30),
    languageIndex + 80,
  );
  if (
    /\b(?:fluent|fluency|proficien(?:t|cy)|native|required|must)\b/iu.test(
      localEvidence,
    )
  )
    return 'REQUIRED';
  return requirementLevel(segment);
}

function employmentType(value: string): EmploymentType | undefined {
  if (/\bfull[- ]time\b/iu.test(value)) return 'full-time';
  if (/\bpart[- ]time\b/iu.test(value)) return 'part-time';
  if (/\b(?:internship|intern)\b/iu.test(value)) return 'internship';
  if (/\b(?:temporary|fixed[- ]term)\b/iu.test(value)) return 'temporary';
  if (/\b(?:contract|contractor|freelance)\b/iu.test(value)) return 'contract';
  return undefined;
}

function remotePolicyValue(value: string): RemotePolicy | undefined {
  if (/\bhybrid\b/iu.test(value)) return 'hybrid';
  if (/\b(?:on[- ]?site|in[- ]office|office[- ]based)\b/iu.test(value))
    return 'onsite';
  if (
    /\b(?:fully remote|remote[- ]first|remote role|remote (?:within|across|in|from|anywhere)|remotely (?:within|across|in|from|anywhere)|work (?:remotely|from home))\b/iu.test(
      value,
    )
  )
    return 'remote';
  return undefined;
}

function remoteScope(value: string): RemoteScope | undefined {
  if (/\b(?:worldwide|anywhere)\b/iu.test(value)) return 'WORLDWIDE';
  if (/\beea\b/iu.test(value)) return 'EEA';
  if (/\b(?:eu|european union)\b/iu.test(value)) return 'EU';
  if (/\beurope\b/iu.test(value)) return 'EUROPE';
  if (/\b(?:time ?zone|utc[+-])\b/iu.test(value)) return 'TIMEZONE';
  return undefined;
}

function policyValue(
  value: string,
  positive: RegExp,
  negative: RegExp,
): boolean | 'UNKNOWN' {
  if (negative.test(value)) return false;
  if (positive.test(value)) return true;
  return 'UNKNOWN';
}

function countryCode(value: string): string | undefined {
  const rules: readonly [string, RegExp][] = [
    ['US', /\b(?:US|USA|United States)\b/u],
    ['GB', /\b(?:UK|United Kingdom)\b/u],
    ['DE', /\b(?:DE|Germany)\b/u],
    ['FR', /\b(?:FR|France)\b/u],
    ['NL', /\b(?:NL|Netherlands)\b/u],
    ['CA', /\b(?:CA|Canada)\b/u],
    ['AU', /\b(?:AU|Australia)\b/u],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0];
}

function isNegatedRequirement(value: string, term: string): boolean {
  const escaped = escapeRegExp(term);
  return new RegExp(
    `(?:no (?:prior )?experience (?:with|in)|not required to (?:know|have)|knowledge of)\\s+${escaped}\\s+(?:is )?not required|${escaped}\\s+(?:is )?not required`,
    'iu',
  ).test(value);
}

function parseNumberWord(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (/^\d+$/u.test(value)) return Number(value);
  const words: Readonly<Record<string, number>> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
  };
  return words[value.toLocaleLowerCase('en-US')];
}

function technology(
  canonicalName: string,
  category: TechnologyCategory,
  pattern: RegExp,
): TechnologyRule {
  return { canonicalName, category, pattern };
}

function language(code: string, name: string, pattern: RegExp) {
  return { code, name, pattern };
}

function clean(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function uniqueFacts(
  values: readonly ExtractedTextFact[],
): readonly ExtractedTextFact[] {
  return uniqueBy(values, (item) => comparisonKey(item.value));
}

function uniqueBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): readonly T[] {
  const values = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(item);
    if (values.has(itemKey)) continue;
    if (values.size >= MAX_FACTS_PER_GROUP) break;
    values.set(itemKey, item);
  }
  return [...values.values()];
}

function preferStrongest<T>(
  items: readonly T[],
  key: (item: T) => string,
  confidence: (item: T) => number,
): readonly T[] {
  const values = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(item);
    const current = values.get(itemKey);
    if (current === undefined && values.size >= MAX_FACTS_PER_GROUP) continue;
    if (current === undefined || confidence(item) > confidence(current))
      values.set(itemKey, item);
  }
  return [...values.values()];
}

function comparisonKey(value: string): string {
  return clean(value)
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isJsonObject(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonStrings(
  value: JsonValue | undefined,
  depth = 0,
): readonly string[] {
  if (depth > 5) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number') return [String(value)];
  if (Array.isArray(value))
    return (value as readonly JsonValue[])
      .slice(0, 100)
      .flatMap((item) => jsonStrings(item, depth + 1));
  if (!isJsonObject(value)) return [];
  return Object.values(value)
    .slice(0, 100)
    .flatMap((item) => jsonStrings(item, depth + 1));
}
