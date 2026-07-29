import {
  createExperienceRange,
  createPercentage,
  createSalaryRange,
  DomainInvariantError,
  type CandidateProfile,
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
    skills: candidate.skills.map((skill) => ({
      name: skill.name,
      ...(skill.yearsOfExperience === undefined
        ? {}
        : { yearsOfExperience: skill.yearsOfExperience }),
    })),
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
        includeKeywords: track.includeKeywords,
        excludeKeywords: track.excludeKeywords,
        preferredSkills: track.preferredSkills,
        preferredIndustries: track.preferredIndustries,
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
      case 'generic-jsonld':
      case 'generic-page':
        return {
          ...common,
          type: source.type,
          settings: { url: source.settings.url },
        };
    }
  });
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
