import type {
  CandidateProfile,
  EnrichedNormalizedJob,
  HardFilterConfiguration,
} from '../../domain/index.js';
import type { ProcessingHasher } from './ports.js';

export function createProcessingConfigFingerprint(
  candidate: CandidateProfile,
  configuration: HardFilterConfiguration,
  hasher: ProcessingHasher,
): string {
  return hasher.sha256(
    stableSerialize({
      candidate: {
        educationLevels: candidate.education.map((item) => item.level).sort(),
        languages: candidate.languages
          .map((item) => ({
            code: item.code,
            proficiency: item.proficiency,
          }))
          .sort((left, right) => left.code.localeCompare(right.code, 'en-US')),
        citizenships: [...candidate.citizenships].sort(),
        workAuthorizations: candidate.workAuthorizations
          .map((item) => ({ country: item.country, status: item.status }))
          .sort((left, right) =>
            `${left.country}|${left.status}`.localeCompare(
              `${right.country}|${right.status}`,
              'en-US',
            ),
          ),
      },
      hardFilters: normalizeHardFilterConfiguration(configuration),
    }),
  );
}

export function createProcessingJobFingerprint(
  job: EnrichedNormalizedJob,
  hasher: ProcessingHasher,
): string {
  return hasher.sha256(
    stableSerialize({
      company: job.companyComparisonKey,
      title: job.titleComparisonKey,
      location: job.location.normalizedKey,
      employmentType: job.employmentType ?? null,
      department:
        job.department?.normalize('NFKC').toLocaleLowerCase('en-US') ?? null,
      office: job.office?.normalize('NFKC').toLocaleLowerCase('en-US') ?? null,
      description: job.description?.normalize('NFKC') ?? null,
    }),
  );
}

function normalizeHardFilterConfiguration(
  configuration: HardFilterConfiguration,
): HardFilterConfiguration {
  return {
    ...configuration,
    allowedCountries: [...configuration.allowedCountries].sort(),
    allowedCountryGroups: [...configuration.allowedCountryGroups].sort(),
    excludedCompanies: [...configuration.excludedCompanies].sort(),
    excludedIndustries: [...configuration.excludedIndustries].sort(),
    excludedTitlePhrases: [...configuration.excludedTitlePhrases].sort(),
    removableTrackingParameters: [
      ...configuration.removableTrackingParameters,
    ].sort(),
    companyLegalSuffixes: [...configuration.companyLegalSuffixes].sort(),
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFKC'));
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  throw new TypeError('Processing fingerprint input is not serializable.');
}
