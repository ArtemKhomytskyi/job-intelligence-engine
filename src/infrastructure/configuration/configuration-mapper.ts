import {
  createExperienceRange,
  createPercentage,
  createSalaryRange,
  DomainInvariantError,
  type CandidateProfile,
  type CompanyConfig,
  type ScoringConfig,
  type SearchConfiguration,
  type SourceConfig,
} from '../../domain/index.js';
import {
  ConfigurationError,
  type ConfigurationSection,
} from '../../application/index.js';
import type { ProfileDocument } from './schemas/profile-schema.js';
import type { ScoringDocument } from './schemas/scoring-schema.js';
import type { SearchDocument } from './schemas/search-schema.js';
import type { SourcesDocument } from './schemas/sources-schema.js';

export function mapProfile(document: ProfileDocument): CandidateProfile {
  const candidate = document.candidate;
  return {
    id: candidate.id,
    displayName: candidate.displayName,
    ...(candidate.headline === undefined
      ? {}
      : { headline: candidate.headline }),
    ...(candidate.summary === undefined ? {} : { summary: candidate.summary }),
    education: candidate.education.map((record) => ({
      level: record.level,
      field: record.field,
      ...(record.institution === undefined
        ? {}
        : { institution: record.institution }),
    })),
    professionalExperienceSummary: candidate.professionalExperienceSummary,
    ...(candidate.totalYearsExperience === undefined
      ? {}
      : { totalYearsExperience: candidate.totalYearsExperience }),
    ...(candidate.experience === undefined
      ? {}
      : {
          experience: {
            roleFamilies: candidate.experience.roleFamilies,
            ...(candidate.experience.managementYears === undefined
              ? {}
              : { managementYears: candidate.experience.managementYears }),
            ...(candidate.experience.internshipYears === undefined
              ? {}
              : { internshipYears: candidate.experience.internshipYears }),
          },
        }),
    ...(candidate.currentSeniority === undefined
      ? {}
      : { currentSeniority: candidate.currentSeniority }),
    ...(candidate.maximumTargetSeniority === undefined
      ? {}
      : { maximumTargetSeniority: candidate.maximumTargetSeniority }),
    ...(candidate.allowSeniorityStretch === undefined
      ? {}
      : { allowSeniorityStretch: candidate.allowSeniorityStretch }),
    skills: candidate.skills.map((skill) => ({
      name: skill.name,
      ...(skill.yearsOfExperience === undefined
        ? {}
        : { yearsOfExperience: skill.yearsOfExperience }),
    })),
    ...(candidate.capabilities === undefined
      ? {}
      : {
          capabilities: {
            programmingLanguages:
              candidate.capabilities.programmingLanguages.map(mapSkill),
            technicalSkills:
              candidate.capabilities.technicalSkills.map(mapSkill),
            domainSkills: candidate.capabilities.domainSkills.map(mapSkill),
            toolsAndPlatforms:
              candidate.capabilities.toolsAndPlatforms.map(mapSkill),
            certifications: candidate.capabilities.certifications,
          },
        }),
    ...(candidate.targetRoles === undefined
      ? {}
      : { targetRoles: candidate.targetRoles }),
    ...(candidate.careerPreferences === undefined
      ? {}
      : {
          careerPreferences: {
            preferredIndustries:
              candidate.careerPreferences.preferredIndustries,
            acceptableIndustries:
              candidate.careerPreferences.acceptableIndustries,
            excludedIndustries: candidate.careerPreferences.excludedIndustries,
            preferredCompanyStages:
              candidate.careerPreferences.preferredCompanyStages,
            preferredCompanySizes:
              candidate.careerPreferences.preferredCompanySizes,
            preferredCompanies: candidate.careerPreferences.preferredCompanies,
            excludedCompanies: candidate.careerPreferences.excludedCompanies,
            preferredRemotePolicies:
              candidate.careerPreferences.preferredRemotePolicies,
            onsiteTolerance: candidate.careerPreferences.onsiteTolerance,
            preferredCountries: candidate.careerPreferences.preferredCountries,
            preferredRegions: candidate.careerPreferences.preferredRegions,
            needsVisaSponsorship:
              candidate.careerPreferences.needsVisaSponsorship,
            ...(candidate.careerPreferences.minimumSalary === undefined
              ? {}
              : { minimumSalary: candidate.careerPreferences.minimumSalary }),
            ...(candidate.careerPreferences.travelTolerancePercent === undefined
              ? {}
              : {
                  travelTolerancePercent:
                    candidate.careerPreferences.travelTolerancePercent,
                }),
          },
        }),
    ...(candidate.evidencePreferences === undefined
      ? {}
      : { evidencePreferences: candidate.evidencePreferences }),
    languages: candidate.languages,
    citizenships: candidate.citizenships,
    workAuthorizations: candidate.workAuthorizations,
    preferredEmploymentTypes: candidate.preferredEmploymentTypes,
    location: {
      country: candidate.location.country,
      ...(candidate.location.city === undefined
        ? {}
        : { city: candidate.location.city }),
      willingToRelocate: candidate.location.willingToRelocate,
      relocationCountries: candidate.location.relocationCountries,
    },
  };
}

function mapSkill(skill: {
  readonly name: string;
  readonly yearsOfExperience?: number | undefined;
}) {
  return {
    name: skill.name,
    ...(skill.yearsOfExperience === undefined
      ? {}
      : { yearsOfExperience: skill.yearsOfExperience }),
  };
}

export function mapSearch(
  document: SearchDocument,
  filePath: string,
): SearchConfiguration {
  try {
    const preferences = document.preferences;
    return {
      tracks: document.tracks.map((track) => ({
        id: track.id,
        displayName: track.displayName,
        enabled: track.enabled,
        targetTitles: track.targetTitles,
        adjacentTitles: track.adjacentTitles,
        excludedTitles: track.excludedTitles,
        roleFamilies: track.roleFamilies,
        excludedRoleFamilies: track.excludedRoleFamilies,
        includeKeywords: track.includeKeywords,
        excludeKeywords: track.excludeKeywords,
        requiredEvidence: track.requiredEvidence,
        preferredEvidence: track.preferredEvidence,
        negativeEvidence: track.negativeEvidence,
        requiredSkills: track.requiredSkills,
        preferredSkills: track.preferredSkills,
        optionalSkills: track.optionalSkills,
        excludedSkills: track.excludedSkills,
        preferredIndustries: track.preferredIndustries,
        ...(track.roleSpecificExperienceYears === undefined
          ? {}
          : { roleSpecificExperienceYears: track.roleSpecificExperienceYears }),
        acceptableSeniorities: track.acceptableSeniorities,
        preferredCountries: track.preferredCountries,
        preferredRemotePolicies: track.preferredRemotePolicies,
        ...(track.minimumScore === undefined
          ? {}
          : { minimumScore: createPercentage(track.minimumScore) }),
        priority: track.priority,
        ...(track.recommendationQuota === undefined
          ? {}
          : { recommendationQuota: track.recommendationQuota }),
      })),
      preferences: {
        preferredCountries: preferences.preferredCountries,
        allowedRemotePolicies: preferences.allowedRemotePolicies,
        willingToRelocate: preferences.willingToRelocate,
        relocationCountries: preferences.relocationCountries,
        preferredCompanySizes: preferences.preferredCompanySizes,
        allowedEmploymentTypes: preferences.allowedEmploymentTypes,
        excludedSeniorityLevels: preferences.excludedSeniorityLevels,
        excludedCompanies: preferences.excludedCompanies,
        excludedIndustries: preferences.excludedIndustries,
        requiredExperience: createExperienceRange(
          preferences.requiredExperience.minimumYears,
          preferences.requiredExperience.maximumYears,
        ),
        ...(preferences.desiredSalary === undefined
          ? {}
          : {
              desiredSalary: createSalaryRange({
                currency: preferences.desiredSalary.currency,
                period: preferences.desiredSalary.period,
                ...(preferences.desiredSalary.minimum === undefined
                  ? {}
                  : { minimum: preferences.desiredSalary.minimum }),
                ...(preferences.desiredSalary.maximum === undefined
                  ? {}
                  : { maximum: preferences.desiredSalary.maximum }),
              }),
            }),
        dailyRecommendationLimit: preferences.dailyRecommendationLimit,
        minimumAcceptableScore: createPercentage(
          preferences.minimumAcceptableScore,
        ),
        maximumRecommendationsPerCompany:
          preferences.maximumRecommendationsPerCompany,
        hardFilters: {
          allowedCountries: preferences.hardFilters.allowedCountries,
          allowedCountryGroups: preferences.hardFilters.allowedCountryGroups,
          rejectUnknownLocation: preferences.hardFilters.rejectUnknownLocation,
          unknownCandidateLanguageLevelPolicy:
            preferences.hardFilters.unknownCandidateLanguageLevelPolicy,
          maximumSeniority: preferences.hardFilters.maximumSeniority,
          maximumRequiredExperienceYears:
            preferences.hardFilters.maximumRequiredExperienceYears,
          maximumRequiredExperienceYearsIntentional:
            preferences.hardFilters.maximumRequiredExperienceYearsIntentional,
          allowMandatoryPhd: preferences.hardFilters.allowMandatoryPhd,
          excludedCompanies: preferences.hardFilters.excludedCompanies,
          excludedIndustries: preferences.hardFilters.excludedIndustries,
          excludedTitlePhrases: preferences.hardFilters.excludedTitlePhrases,
          rejectUnknownIndustry: preferences.hardFilters.rejectUnknownIndustry,
          removableTrackingParameters:
            preferences.hardFilters.removableTrackingParameters,
          companyLegalSuffixes: preferences.hardFilters.companyLegalSuffixes,
        },
      },
    };
  } catch (cause: unknown) {
    throw mapInvariantError(cause, 'search', filePath);
  }
}

export function mapScoring(document: ScoringDocument): ScoringConfig {
  return {
    weights: {
      titleRelevance: createPercentage(document.weights.titleRelevance),
      skills: createPercentage(document.weights.skills),
      experience: createPercentage(document.weights.experience),
      location: createPercentage(document.weights.location),
      workAuthorization: createPercentage(document.weights.workAuthorization),
      education: createPercentage(document.weights.education),
      language: createPercentage(document.weights.language),
      companyPreference: createPercentage(document.weights.companyPreference),
      freshness: createPercentage(document.weights.freshness),
      salary: createPercentage(document.weights.salary),
      sourceQuality: createPercentage(document.weights.sourceQuality),
      applicationSimplicity: createPercentage(
        document.weights.applicationSimplicity,
      ),
    },
    settings: document.settings,
  };
}

export function mapSources(document: SourcesDocument): readonly SourceConfig[] {
  return document.sources.map((source) => {
    const common = {
      id: source.id,
      enabled: source.enabled,
      displayName: source.displayName,
      tags: source.tags,
      trackIds: source.trackIds,
      trackPolicy: source.trackPolicy,
      ...(source.company === undefined ? {} : { company: source.company }),
      ...(source.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: source.requestTimeoutMs }),
      ...(source.requestsPerSecond === undefined
        ? {}
        : { requestsPerSecond: source.requestsPerSecond }),
    };

    switch (source.type) {
      case 'greenhouse':
        return {
          ...common,
          type: source.type,
          settings: {
            boardToken: source.settings.boardToken,
            ...(source.settings.boardUrl === undefined
              ? {}
              : { boardUrl: source.settings.boardUrl }),
          },
        };
      case 'lever':
        return {
          ...common,
          type: source.type,
          settings: {
            companySlug: source.settings.companySlug,
            ...(source.settings.jobsUrl === undefined
              ? {}
              : { jobsUrl: source.settings.jobsUrl }),
          },
        };
      case 'ashby':
      case 'smartrecruiters':
      case 'workable':
      case 'bamboohr':
      case 'recruitee':
      case 'teamtailor':
      case 'personio':
      case 'jobvite':
        return {
          ...common,
          type: source.type,
          settings: {
            identifier: source.settings.identifier,
            ...(source.settings.url === undefined
              ? {}
              : { url: source.settings.url }),
          },
        };
      case 'generic-jsonld':
        return {
          ...common,
          type: source.type,
          settings: { url: source.settings.url },
        };
      case 'generic-page':
      case 'generic-job-list':
        return {
          ...common,
          type: source.type,
          settings: {
            url: source.settings.url,
            ...(source.settings.browserTimeoutMs === undefined
              ? {}
              : { browserTimeoutMs: source.settings.browserTimeoutMs }),
            ...(source.settings.maxDiscoveredLinks === undefined
              ? {}
              : { maxDiscoveredLinks: source.settings.maxDiscoveredLinks }),
            ...(source.settings.maxTraversalDepth === undefined
              ? {}
              : { maxTraversalDepth: source.settings.maxTraversalDepth }),
            ...(source.settings.allowBrowserFallback === undefined
              ? {}
              : { allowBrowserFallback: source.settings.allowBrowserFallback }),
          },
        };
    }
  });
}

export function mapCompanies(
  document: SourcesDocument,
): readonly CompanyConfig[] {
  return document.companies.map((company) => ({
    id: company.id,
    name: company.name,
    enabled: company.enabled,
    ...(company.careersUrl === undefined
      ? {}
      : { careersUrl: company.careersUrl }),
    ...(company.websiteUrl === undefined
      ? {}
      : { websiteUrl: company.websiteUrl }),
    tags: company.tags,
    trackIds: company.trackIds,
    trackPolicy: company.trackPolicy,
    ...(company.sourceOverride === undefined
      ? {}
      : {
          sourceOverride: {
            type: company.sourceOverride.type,
            ...(company.sourceOverride.identifier === undefined
              ? {}
              : { identifier: company.sourceOverride.identifier }),
            ...(company.sourceOverride.url === undefined
              ? {}
              : { url: company.sourceOverride.url }),
          },
        }),
  }));
}

function mapInvariantError(
  cause: unknown,
  section: ConfigurationSection,
  filePath: string,
): ConfigurationError {
  if (cause instanceof DomainInvariantError) {
    return new ConfigurationError(
      [
        {
          code: cause.code.endsWith('RANGE_INVALID')
            ? 'CONFIG_RANGE_INVALID'
            : 'CONFIG_SCHEMA_INVALID',
          section,
          filePath,
          message: cause.message,
        },
      ],
      { cause },
    );
  }

  return new ConfigurationError(
    [
      {
        code: 'CONFIG_INTERNAL_ERROR',
        section,
        filePath,
        message: `Unexpected failure while mapping ${section} configuration.`,
      },
    ],
    { cause },
  );
}
