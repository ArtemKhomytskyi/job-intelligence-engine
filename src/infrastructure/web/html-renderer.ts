import type {
  LatestPipelineState,
  PipelineStage,
  RecommendationDetails,
  RecommendationListItem,
  RecommendationReport,
  ScoreComponentView,
} from '../../application/index.js';
import { REPORT_SORTS, REPORT_STATUSES } from '../../application/index.js';
import {
  normalizePublicUrlValue,
  type ScoreReason,
  type SourceReadinessReport,
} from '../../domain/index.js';

export function renderRecommendationReport(
  report: RecommendationReport,
  notice?: string,
  sourceReadiness?: SourceReadinessReport,
): string {
  const batch = report.batch;
  const heading =
    batch === undefined
      ? 'Recommendation report'
      : `${report.items.length} recommendation${report.items.length === 1 ? '' : 's'}`;
  return layout(
    'Recommendations',
    `<div class="page-heading">
      <div><p class="eyebrow">Latest persisted batch</p><h1>${escapeHtml(heading)}</h1></div>
      ${renderRunControl(sourceReadiness)}
    </div>
    ${notice === undefined ? '' : `<p class="notice" role="status">${escapeHtml(notice)}</p>`}
    ${renderFirstRunState(sourceReadiness)}
    ${renderPipelineState(report.latestState)}
    ${batch === undefined ? renderNoBatch() : `${renderBatchMetadata(report)}${renderFilters(report)}${renderItems(report.items)}`}`,
  );
}

export function renderRecommendationDetails(
  details: RecommendationDetails,
  notice?: string,
): string {
  return layout(
    details.originalTitle,
    `<p class="breadcrumb"><a href="/recommendations">← Back to recommendations</a></p>
    ${notice === undefined ? '' : `<p class="notice" role="status">${escapeHtml(notice)}</p>`}
    <div class="page-heading">
      <div><p class="eyebrow">Rank ${details.rank} · ${escapeHtml(details.selectedTrackId)}</p><h1>${escapeHtml(details.originalTitle)}</h1><p class="company">${escapeHtml(details.company)}</p></div>
      <div class="actions">${renderApplyLink(details.applicationUrl)}${renderStatusForms(details.recommendationId, details.currentStatus)}</div>
    </div>
    <section class="panel" aria-labelledby="overview-heading">
      <h2 id="overview-heading">Opportunity overview</h2>
      <div class="metadata-grid">
        ${metric('Final score', formatScore(details.finalScore))}
        ${metric('Opportunity score', formatScore(details.opportunityScore))}
        ${metric('Completeness', `${Math.round(details.completeness * 100)}%`)}
        ${metric('Status', details.currentStatus)}
        ${metric('Location', details.location ?? 'Not provided')}
        ${metric('Remote policy', details.remotePolicy ?? 'Not provided')}
        ${metric('Employment type', details.employmentType ?? 'Not provided')}
        ${metric('Salary', details.salarySummary ?? 'Not provided')}
        ${metric('Generated', formatDate(details.generatedAt))}
      </div>
    </section>
    <section class="panel" aria-labelledby="requirements-heading">
      <h2 id="requirements-heading">Role and requirements</h2>
      <dl class="detail-grid">
        ${definition('Normalized title', details.normalizedTitle)}
        ${definition('Experience', joinOrUnavailable(details.experienceRequirements))}
        ${definition('Education', joinOrUnavailable(details.educationRequirements))}
        ${definition('Languages', joinOrUnavailable(details.languages))}
        ${definition('Skills', joinOrUnavailable(details.skills))}
        ${definition('Processed', details.processedAt === undefined ? 'Unavailable' : formatDate(details.processedAt))}
        ${definition('Normalized', details.normalizedAt === undefined ? 'Unavailable' : formatDate(details.normalizedAt))}
        ${definitionHtml('Source', renderExternalLink(details.sourceUrl, 'Open source page'))}
      </dl>
    </section>
    ${renderSignals(details.positives, details.concerns, details.missingData)}
    ${renderScoreBreakdown(details.components)}
    <section class="panel" aria-labelledby="description-heading">
      <h2 id="description-heading">Original job description</h2>
      <pre class="description">${escapeHtml(details.description ?? 'No description was persisted.')}</pre>
    </section>
    <section class="panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Status history</h2>
      ${details.statusHistory.length === 0 ? '<p class="muted">No status history is available.</p>' : `<ol class="history">${details.statusHistory.map((item) => `<li><strong>${escapeHtml(item.toStatus)}</strong> · ${escapeHtml(formatDate(item.changedAt))}${item.fromStatus === undefined ? '' : ` from ${escapeHtml(item.fromStatus)}`}${item.reason === undefined ? '' : ` · ${escapeHtml(item.reason)}`}</li>`).join('')}</ol>`}
    </section>`,
  );
}

export function renderRunsPage(
  state: LatestPipelineState,
  sourceReadiness?: SourceReadinessReport,
): string {
  return layout(
    'Latest pipeline state',
    `<div class="page-heading"><div><p class="eyebrow">Persisted run records</p><h1>Latest pipeline state</h1></div>${renderRunControl(sourceReadiness)}</div>${renderFirstRunState(sourceReadiness)}${renderPipelineState(state)}`,
  );
}

export function renderSetupPage(
  sourceReadiness: SourceReadinessReport,
  notice?: string,
): string {
  return layout(
    'Source setup',
    `<div class="page-heading"><div><p class="eyebrow">Local first-run setup</p><h1>Configure real job sources</h1></div></div>
    ${notice === undefined ? '' : `<p class="notice" role="status">${escapeHtml(notice)}</p>`}
    ${renderFirstRunState(sourceReadiness)}
    <section class="panel"><h2>1. Create private configuration files</h2>
      <p>The required private files are <code>config/profile.yaml</code>, <code>config/search.yaml</code>, <code>config/scoring.yaml</code>, and <code>config/sources.yaml</code>. They are Git-ignored and must not be committed.</p>
      <pre class="description">Copy-Item config/profile.example.yaml config/profile.yaml
Copy-Item config/search.example.yaml config/search.yaml
Copy-Item config/scoring.example.yaml config/scoring.yaml
Copy-Item config/sources.example.yaml config/sources.yaml</pre>
      <p>Edit every copied file. Replace example source URLs, board tokens, and company slugs before enabling a source.</p></section>
    <section class="panel"><h2>2. Add a supported source</h2><p>Supported collection types are Greenhouse, Lever, generic job-list, and generic-page. Tracked templates remain disabled until edited.</p></section>
    <section class="panel"><h2>3. Validate and run</h2>
      <pre class="description">npm run cli -- sources:check
npm run cli -- validate-config
npm run cli -- collect
npm run cli -- run
npm run cli -- serve</pre>
      <p><code>sources:check</code> performs no network requests. Collection and the full pipeline contact only sources you explicitly enable.</p></section>
    <p><a class="button" href="/recommendations">Back to recommendations</a></p>`,
  );
}

export function renderPipelineFailurePage(
  stage: PipelineStage,
  state: LatestPipelineState,
): string {
  const collection = state.collection;
  return layout(
    'Pipeline run failed',
    `<section class="panel" role="alert" aria-labelledby="pipeline-failure-heading">
      <p class="eyebrow">Controlled pipeline failure</p>
      <h1 id="pipeline-failure-heading">Pipeline run failed</h1>
      <p>${escapeHtml(pipelineFailureExplanation(stage))}</p>
      <div class="metadata-grid">
        ${metric('Failed stage', humanize(stage))}
        ${metric('Sources attempted', collection === undefined ? 'Unavailable' : String(collection.sourcesAttempted))}
        ${metric('Sources succeeded', collection === undefined ? 'Unavailable' : String(collection.sourcesSucceeded))}
        ${metric('Sources failed', collection === undefined ? 'Unavailable' : String(collection.sourcesFailed))}
        ${metric('Jobs collected', collection === undefined ? 'Unavailable' : String(collection.jobsCollected))}
        ${metric('Jobs created', collection === undefined ? 'Unavailable' : String(collection.jobsCreated))}
        ${metric('Jobs updated', collection === undefined ? 'Unavailable' : String(collection.jobsUpdated))}
      </div>
    </section>
    <section class="panel" aria-labelledby="attempt-progress-heading">
      <h2 id="attempt-progress-heading">Stages in this attempt</h2>
      <div class="metadata-grid">${pipelineStageProgress(stage)
        .map(({ label, status }) => metric(label, status))
        .join('')}</div>
      <p class="muted">Persisted run records remain available. Older downstream records, if present, belong to earlier attempts.</p>
    </section>
    <div class="actions"><a class="button" href="/runs/latest">View latest pipeline state</a><a class="button secondary" href="/recommendations">Back to recommendations</a></div>`,
  );
}

export function renderErrorPage(
  status: number,
  title: string,
  message: string,
): string {
  return layout(
    title,
    `<section class="panel empty"><p class="eyebrow">Error ${status}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a class="button" href="/recommendations">Return to recommendations</a></p></section>`,
  );
}

function renderBatchMetadata(report: RecommendationReport): string {
  const batch = report.batch;
  if (batch === undefined) return '';
  return `<section class="panel" aria-labelledby="batch-heading">
    <h2 id="batch-heading">Batch metadata</h2>
    <div class="metadata-grid">
      ${metric('Batch ID', batch.id)}
      ${metric('Evaluation time', formatDate(batch.evaluationTime))}
      ${metric('Selected / requested', `${batch.selectedCount} / ${batch.requestedLimit}`)}
      ${metric('Reused', batch.reused === undefined ? 'Not recorded historically' : batch.reused ? 'Yes' : 'No')}
      ${metric('Last collection', report.latestState?.collection?.completedAt === undefined ? 'Unavailable' : formatDate(report.latestState.collection.completedAt))}
    </div>
  </section>`;
}

function renderFilters(report: RecommendationReport): string {
  const query = report.query;
  return `<form class="panel toolbar" method="get" action="/recommendations" aria-label="Recommendation filters">
    ${selectControl('track', 'Track', report.availableTrackIds, query.trackId)}
    ${selectControl('status', 'Status', REPORT_STATUSES, query.status)}
    <label>Company<input name="company" value="${escapeAttribute(query.company ?? '')}" placeholder="Company name"></label>
    <label>Minimum score<input name="minimumScore" type="number" min="0" max="100" step="0.1" value="${query.minimumScore ?? ''}"></label>
    ${selectControl('sort', 'Sort', REPORT_SORTS, query.sort, false)}
    <div><button type="submit">Apply filters</button></div>
    ${query.batchId === undefined ? '' : `<input type="hidden" name="batch" value="${escapeAttribute(query.batchId)}">`}
  </form>`;
}

function renderItems(items: readonly RecommendationListItem[]): string {
  if (items.length === 0)
    return `<section class="panel empty"><h2>No matching recommendations</h2><p class="muted">The batch exists, but no recommendations match these filters.</p><a href="/recommendations">Clear filters</a></section>`;
  return `<div class="results-summary"><strong>${items.length} shown</strong><span class="muted">Stable deterministic ordering</span></div><section class="recommendations" aria-label="Recommendations">${items.map(renderItem).join('')}</section>`;
}

function renderItem(item: RecommendationListItem): string {
  return `<article class="recommendation">
    <div class="rank" aria-label="Rank ${item.rank}">#${item.rank}</div>
    <div>
      <h2><a href="/recommendations/${encodeURIComponent(item.recommendationId)}">${escapeHtml(item.title)}</a></h2>
      <p class="company">${escapeHtml(item.company)}</p>
      <div class="facts">
        <span class="pill score">Score ${formatScore(item.finalScore)}</span>
        <span class="pill">Opportunity ${formatScore(item.opportunityScore)}</span>
        <span class="pill">${escapeHtml(item.selectedTrackId)}</span>
        <span class="pill status">${escapeHtml(item.currentStatus)}</span>
        ${item.location === undefined ? '' : `<span class="pill">${escapeHtml(item.location)}</span>`}
        ${item.remotePolicy === undefined ? '' : `<span class="pill">${escapeHtml(item.remotePolicy)}</span>`}
        ${item.salarySummary === undefined ? '' : `<span class="pill">${escapeHtml(item.salarySummary)}</span>`}
        <span class="pill">${item.publishedAt === undefined ? 'Freshness unavailable' : `Posted ${escapeHtml(formatDate(item.publishedAt))}`}</span>
      </div>
      <div class="signal-list">
        ${item.positives
          .slice(0, 2)
          .map(
            (reason) =>
              `<span class="pill positive">+ ${escapeHtml(reason.message)}</span>`,
          )
          .join('')}
        ${item.concerns
          .slice(0, 2)
          .map(
            (reason) =>
              `<span class="pill concern">Concern: ${escapeHtml(reason.message)}</span>`,
          )
          .join('')}
        <span class="pill missing">${item.missingDataCount} missing data field${item.missingDataCount === 1 ? '' : 's'}</span>
      </div>
    </div>
    <div class="actions">
      <a class="button secondary" href="/recommendations/${encodeURIComponent(item.recommendationId)}">Details</a>
      ${renderApplyLink(item.applicationUrl)}
      ${renderStatusForms(item.recommendationId, item.currentStatus)}
    </div>
  </article>`;
}

function renderStatusForms(
  recommendationId: string,
  currentStatus: string,
): string {
  const action = `/recommendations/${encodeURIComponent(recommendationId)}/status`;
  const buttons = ['VIEWED', 'APPLIED', 'SKIPPED']
    .filter((status) => status !== currentStatus)
    .map(
      (status) =>
        `<form method="post" action="${action}"><input type="hidden" name="status" value="${status}"><button class="${status === 'SKIPPED' ? 'warning' : 'secondary'}" type="submit">Mark ${status.toLocaleLowerCase('en-US')}</button></form>`,
    )
    .join('');
  return `<div class="status-actions" aria-label="Update application status">${buttons}</div>`;
}

function renderApplyLink(url: string | undefined): string {
  const safe = safeExternalUrl(url);
  return safe === undefined
    ? '<span class="pill missing">Apply URL unavailable</span>'
    : `<a class="button" href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer">Apply</a>`;
}

function renderSignals(
  positives: readonly ScoreReason[],
  concerns: readonly ScoreReason[],
  missing: readonly string[],
): string {
  return `<section class="panel" aria-labelledby="signals-heading"><h2 id="signals-heading">Explainability</h2><div class="detail-grid">
    <div><h3>Positive signals</h3>${reasonList(positives, 'No positive signals recorded.')}</div>
    <div><h3>Concerns</h3>${reasonList(concerns, 'No concerns recorded.')}</div>
    <div><h3>Missing data</h3>${stringList(missing, 'No missing-data keys.')}</div>
  </div></section>`;
}

function renderScoreBreakdown(
  components: readonly ScoreComponentView[],
): string {
  return `<section class="panel" aria-labelledby="score-heading"><h2 id="score-heading">Score breakdown</h2>
    <table class="score-table"><thead><tr><th>Component</th><th>Score</th><th>Weight</th><th>Contribution</th><th>Confidence</th><th>Reasons</th></tr></thead>
    <tbody>${components.map((component) => `<tr><th scope="row">${escapeHtml(humanize(component.key))}</th><td>${formatScore(component.score)}</td><td>${formatScore(component.weight)}</td><td>${formatScore(component.contribution)}</td><td>${Math.round(component.confidence * 100)}%</td><td>${reasonList(component.reasons, 'No reasons recorded.')}</td></tr>`).join('')}</tbody></table>
  </section>`;
}

function renderPipelineState(state: LatestPipelineState | undefined): string {
  if (
    state === undefined ||
    (state.collection === undefined &&
      state.processing === undefined &&
      state.recommendations === undefined)
  )
    return `<section class="panel"><h2>Pipeline status</h2><p class="muted">No persisted pipeline state is available yet.</p></section>`;
  return `<section class="panel" aria-labelledby="pipeline-heading"><h2 id="pipeline-heading">Latest pipeline state</h2><div class="pipeline-grid">
    <div><h3>Collection</h3>${state.collection === undefined ? '<p class="muted">Unavailable</p>' : `<div class="metadata-grid">${metric('Status', state.collection.status)}${metric('Sources', `${state.collection.sourcesSucceeded} succeeded / ${state.collection.sourcesFailed} failed`)}${metric('Jobs', `${state.collection.jobsCollected} collected · ${state.collection.jobsCreated} created · ${state.collection.jobsUpdated} updated`)}${metric('Updated', formatDate(state.collection.completedAt ?? state.collection.startedAt))}</div>`}</div>
    <div><h3>Processing</h3>${state.processing === undefined ? '<p class="muted">Unavailable</p>' : `<div class="metadata-grid">${metric('Status', state.processing.status)}${metric('Counts', `${state.processing.eligible} eligible · ${state.processing.rejected} rejected`)}${metric('Duplicates', `${state.processing.duplicates} exact · ${state.processing.possibleDuplicates} possible`)}${metric('Errors', String(state.processing.errors))}</div>`}</div>
    <div><h3>Recommendations</h3>${state.recommendations === undefined ? '<p class="muted">Unavailable</p>' : `<div class="metadata-grid">${metric('Batch', state.recommendations.batchId)}${metric('Selected', `${state.recommendations.selected} / ${state.recommendations.requested}`)}${metric('Evaluated', formatDate(state.recommendations.evaluationTime))}</div>`}</div>
  </div></section>`;
}

function pipelineFailureExplanation(stage: PipelineStage): string {
  const explanations: Record<PipelineStage, string> = {
    configuration:
      'Configuration could not be loaded or validated, so no pipeline work was started.',
    collection:
      'Collection did not produce a successful source result. Processing and recommendation generation were not run.',
    processing:
      'Collected jobs could not be processed successfully. Recommendation generation was not run.',
    recommendations:
      'Recommendation generation or persistence did not complete successfully.',
  };
  return explanations[stage];
}

function pipelineStageProgress(
  failedStage: PipelineStage,
): readonly { readonly label: string; readonly status: string }[] {
  const stages: readonly PipelineStage[] = [
    'configuration',
    'collection',
    'processing',
    'recommendations',
  ];
  const failedIndex = stages.indexOf(failedStage);
  return stages.map((stage, index) => ({
    label: humanize(stage),
    status:
      index < failedIndex
        ? 'Completed'
        : index === failedIndex
          ? 'Failed'
          : 'Not run',
  }));
}

function renderNoBatch(): string {
  return `<section class="panel empty"><h2>No recommendation batch yet</h2><p class="muted">Run the pipeline to collect, process, score, and persist recommendations.</p></section>`;
}

function renderRunControl(
  sourceReadiness: SourceReadinessReport | undefined,
): string {
  if (sourceReadiness !== undefined && !sourceReadiness.hasRealEnabledSource)
    return `<a class="button" href="/setup">Set up job sources</a>`;
  return `<form class="run-form" method="post" action="/actions/run" data-running-form><button type="submit" data-running-label="Pipeline running…">Run pipeline</button></form>`;
}

function renderFirstRunState(
  sourceReadiness: SourceReadinessReport | undefined,
): string {
  if (sourceReadiness === undefined || sourceReadiness.hasRealEnabledSource)
    return '';
  return `<section class="panel empty" aria-labelledby="source-setup-heading"><p class="eyebrow">Setup required</p><h2 id="source-setup-heading">No real job sources configured.</h2><p>Add at least one Greenhouse, Lever, generic job-list, or generic-page source to <code>config/sources.yaml</code>.</p><p><a href="/setup">Open source setup instructions</a></p></section>`;
}

function layout(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · JIE</title><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head><body><header class="site-header"><div class="shell header-inner"><a class="brand" href="/recommendations">Job Intelligence Engine<small>Local report</small></a><nav aria-label="Primary"><a href="/recommendations">Recommendations</a><a href="/runs/latest">Pipeline</a></nav></div></header><main class="shell">${content}</main><footer class="shell">Local-only report · PostgreSQL is authoritative · JIE never submits applications</footer></body></html>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function definition(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function definitionHtml(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function selectControl(
  name: string,
  label: string,
  options: readonly string[],
  selected: string | undefined,
  includeAll = true,
): string {
  return `<label>${escapeHtml(label)}<select name="${escapeAttribute(name)}">${includeAll ? '<option value="">All</option>' : ''}${options.map((option) => `<option value="${escapeAttribute(option)}"${option === selected ? ' selected' : ''}>${escapeHtml(humanize(option))}</option>`).join('')}</select></label>`;
}

function reasonList(reasons: readonly ScoreReason[], empty: string): string {
  return reasons.length === 0
    ? `<p class="muted">${escapeHtml(empty)}</p>`
    : `<ul class="score-reasons">${reasons.map((reason) => `<li><strong>${escapeHtml(reason.impact)}</strong>: ${escapeHtml(reason.message)} <span class="muted">(${escapeHtml(reason.code)})</span></li>`).join('')}</ul>`;
}

function stringList(values: readonly string[], empty: string): string {
  return values.length === 0
    ? `<p class="muted">${escapeHtml(empty)}</p>`
    : `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function renderExternalLink(url: string | undefined, label: string): string {
  const safe = safeExternalUrl(url);
  return safe === undefined
    ? 'Unavailable'
    : `<a href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function safeExternalUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizePublicUrlValue(value);
  return normalized.status === 'SUCCESS' ? normalized.value : undefined;
}

function joinOrUnavailable(values: readonly string[]): string {
  return values.length === 0 ? 'Unavailable' : values.join(' · ');
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
    : value;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function humanize(value: string): string {
  return value
    .replace(/-/gu, ' ')
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (letter) => letter.toLocaleUpperCase('en-US'));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
