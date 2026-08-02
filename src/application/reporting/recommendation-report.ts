import type { Clock, Logger } from '../collection/ports.js';
import type {
  RecommendationDetails,
  RecommendationReport,
  RecommendationReportQuery,
  UpdateApplicationStatusResult,
  UserApplicationStatus,
} from './models.js';
import { USER_APPLICATION_STATUSES } from './models.js';
import type { RecommendationReportRepository } from './ports.js';
import {
  filterAndSortRecommendations,
  ReportQueryError,
} from './report-query.js';

export class RecommendationNotFoundError extends Error {
  public constructor() {
    super('The recommendation was not found.');
    this.name = 'RecommendationNotFoundError';
  }
}

export class ApplicationStatusError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationStatusError';
  }
}

export class GetRecommendationReport {
  public constructor(
    private readonly repository: RecommendationReportRepository,
  ) {}

  public async execute(
    query: RecommendationReportQuery,
  ): Promise<RecommendationReport> {
    const [batch, latestState] = await Promise.all([
      this.repository.getRecommendationBatch(query.batchId),
      this.repository.getLatestPipelineState(),
    ]);
    const allItems = batch?.items ?? [];
    const availableTrackIds = [
      ...new Set(allItems.map((item) => item.selectedTrackId)),
    ].sort();
    if (
      query.trackId !== undefined &&
      batch !== undefined &&
      !availableTrackIds.includes(query.trackId)
    )
      throw new ReportQueryError(
        `Unknown track "${query.trackId}" for this recommendation batch.`,
      );
    return {
      query,
      ...(batch === undefined ? {} : { batch }),
      items: filterAndSortRecommendations(allItems, query),
      availableTrackIds,
      availableCompanies: [
        ...new Set(allItems.map((item) => item.company)),
      ].sort((left, right) => left.localeCompare(right, 'en-US')),
      latestState,
    };
  }
}

export class UpdateJobApplicationStatus {
  public constructor(
    private readonly repository: RecommendationReportRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  public async execute(
    recommendationId: string,
    targetStatus: UserApplicationStatus,
    reason = 'USER_ACTION',
  ): Promise<UpdateApplicationStatusResult> {
    if (!USER_APPLICATION_STATUSES.some((status) => status === targetStatus))
      throw new ApplicationStatusError(
        'Status must be VIEWED, APPLIED, or SKIPPED.',
      );
    const result = await this.repository.updateApplicationStatus({
      recommendationId,
      targetStatus,
      changedAt: this.clock.now().toISOString(),
      reason,
    });
    if (result === undefined) throw new RecommendationNotFoundError();
    this.logger.info('application_status_updated', {
      recommendationId,
      jobId: result.jobId,
      targetStatus,
      changed: result.changed,
    });
    return result;
  }
}

export class GetRecommendationDetails {
  public constructor(
    private readonly repository: RecommendationReportRepository,
    private readonly statusUpdater: UpdateJobApplicationStatus,
  ) {}

  public async execute(
    recommendationId: string,
  ): Promise<RecommendationDetails> {
    let details =
      await this.repository.getRecommendationDetails(recommendationId);
    if (details === undefined) throw new RecommendationNotFoundError();
    if (
      details.currentStatus === 'NEW' ||
      details.currentStatus === 'RECOMMENDED'
    ) {
      await this.statusUpdater.execute(
        recommendationId,
        'VIEWED',
        'DETAIL_VIEW',
      );
      details =
        await this.repository.getRecommendationDetails(recommendationId);
      if (details === undefined) throw new RecommendationNotFoundError();
    }
    return details;
  }
}
