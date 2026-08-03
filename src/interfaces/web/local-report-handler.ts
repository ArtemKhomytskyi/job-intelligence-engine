import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  ActivePipelineRunError,
  ApplicationStatusError,
  PipelineStageError,
  RecommendationNotFoundError,
  ReportQueryError,
  USER_APPLICATION_STATUSES,
  parseRecommendationReportQuery,
  type DatabaseHealthPort,
  type FullPipelineRunner,
  type Logger,
  type PipelineStage,
  type RecommendationDetails,
  type RecommendationReport,
  type RecommendationReportQuery,
  type UpdateApplicationStatusResult,
  type UserApplicationStatus,
} from '../../application/index.js';
import type { SourceReadinessReport } from '../../domain/index.js';
import {
  APP_CSS,
  APP_JS,
  renderErrorPage,
  renderPipelineFailurePage,
  renderRecommendationDetails,
  renderRecommendationReport,
  renderRunsPage,
  renderSetupPage,
} from '../../infrastructure/index.js';

const MAX_FORM_BYTES = 8_192;
const RECOMMENDATION_PATH = /^\/recommendations\/([^/]+)$/u;
const STATUS_PATH = /^\/recommendations\/([^/]+)\/status$/u;
const DEFAULT_SOURCE_READINESS: SourceReadinessReport = {
  sources: [],
  hasRealEnabledSource: true,
};

export interface LocalReportHandlerDependencies {
  readonly runtime: LocalReportRuntime;
  readonly logger: Logger;
  readonly pipelineSignal: AbortSignal;
  readonly collectionConcurrency: number;
  readonly processingLimit: number;
  readonly sourceReadiness?: SourceReadinessReport;
}

export interface LocalReportRuntime {
  readonly pipeline: FullPipelineRunner;
  readonly getReport: {
    execute(query: RecommendationReportQuery): Promise<RecommendationReport>;
  };
  readonly getDetails: {
    execute(recommendationId: string): Promise<RecommendationDetails>;
  };
  readonly updateStatus: {
    execute(
      recommendationId: string,
      targetStatus: UserApplicationStatus,
      reason?: string,
    ): Promise<UpdateApplicationStatusResult>;
  };
  readonly health: DatabaseHealthPort;
}

export function createLocalReportHandler(
  dependencies: LocalReportHandlerDependencies,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleRequest(dependencies, request, response).catch(
      (error: unknown) => {
        dependencies.logger.error('http_request_failed', {
          method: request.method,
          path: safePath(request.url),
          errorCode: error instanceof Error ? error.name : 'HTTP_ERROR',
        });
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const mapped = mapWebError(error);
        sendHtml(
          response,
          mapped.status,
          renderErrorPage(mapped.status, mapped.title, mapped.message),
        );
      },
    );
  };
}

async function handleRequest(
  dependencies: LocalReportHandlerDependencies,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setSecurityHeaders(response);
  const method = request.method ?? 'GET';
  const base = requestBase(request);
  const url = new URL(request.url ?? '/', base);

  if (method === 'GET' && url.pathname === '/') {
    redirect(response, '/recommendations');
    return;
  }
  if (method === 'GET' && url.pathname === '/assets/app.css') {
    sendAsset(response, 'text/css; charset=utf-8', APP_CSS);
    return;
  }
  if (method === 'GET' && url.pathname === '/assets/app.js') {
    sendAsset(response, 'text/javascript; charset=utf-8', APP_JS);
    return;
  }
  if (method === 'GET' && url.pathname === '/health') {
    try {
      await dependencies.runtime.health.check();
      sendJson(response, 200, { status: 'ok' });
    } catch {
      sendJson(response, 503, { status: 'unavailable' });
    }
    return;
  }
  if (method === 'GET' && url.pathname === '/recommendations') {
    await renderList(dependencies, response, url);
    return;
  }
  if (method === 'GET' && url.pathname === '/setup') {
    sendHtml(
      response,
      200,
      renderSetupPage(
        getSourceReadiness(dependencies),
        url.searchParams.get('notice') === 'sources-required'
          ? 'Add and enable a real job source before running the pipeline.'
          : undefined,
      ),
    );
    return;
  }
  if (method === 'GET' && url.pathname === '/runs/latest') {
    const query = parseRecommendationReportQuery({ sort: 'rank' });
    const report = await dependencies.runtime.getReport.execute(query);
    const failedStage = parsePipelineFailureStage(url.searchParams);
    sendHtml(
      response,
      200,
      failedStage === undefined
        ? renderRunsPage(
            report.latestState ?? {},
            getSourceReadiness(dependencies),
          )
        : renderPipelineFailurePage(failedStage, report.latestState ?? {}),
    );
    return;
  }
  const statusMatch = STATUS_PATH.exec(url.pathname);
  if (method === 'POST' && statusMatch !== null) {
    requireSameOrigin(request);
    const recommendationId = decodePathSegment(statusMatch[1]);
    const body = await readForm(request);
    const status = body.get('status');
    if (!isUserStatus(status))
      throw new ApplicationStatusError(
        'Status must be VIEWED, APPLIED, or SKIPPED.',
      );
    await dependencies.runtime.updateStatus.execute(recommendationId, status);
    redirect(
      response,
      `/recommendations/${encodeURIComponent(recommendationId)}?notice=status-updated`,
      303,
    );
    return;
  }
  if (method === 'POST' && url.pathname === '/actions/run') {
    requireSameOrigin(request);
    await readForm(request);
    if (!getSourceReadiness(dependencies).hasRealEnabledSource) {
      dependencies.logger.warn('manual_pipeline_blocked_sources_not_ready');
      redirect(response, '/setup?notice=sources-required', 303);
      return;
    }
    try {
      await dependencies.runtime.pipeline.execute({
        initiatedBy: 'web',
        collectionConcurrency: dependencies.collectionConcurrency,
        processingLimit: dependencies.processingLimit,
        evaluationTime: new Date(),
        signal: dependencies.pipelineSignal,
      });
    } catch (error) {
      if (!(error instanceof PipelineStageError)) throw error;
      dependencies.logger.warn('manual_pipeline_failed', {
        initiatedBy: 'web',
        failedStage: error.stage,
      });
      redirect(
        response,
        `/runs/latest?failure=${encodeURIComponent(error.stage)}`,
        303,
      );
      return;
    }
    redirect(response, '/recommendations?notice=pipeline-complete', 303);
    return;
  }
  const recommendationMatch = RECOMMENDATION_PATH.exec(url.pathname);
  if (method === 'GET' && recommendationMatch !== null) {
    const recommendationId = decodePathSegment(recommendationMatch[1]);
    const details =
      await dependencies.runtime.getDetails.execute(recommendationId);
    sendHtml(
      response,
      200,
      renderRecommendationDetails(
        details,
        noticeMessage(url.searchParams.get('notice')),
      ),
    );
    return;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    sendHtml(
      response,
      405,
      renderErrorPage(
        405,
        'Method not allowed',
        'This action does not accept that HTTP method.',
      ),
      {
        Allow: 'GET, POST',
      },
    );
    return;
  }
  sendHtml(
    response,
    404,
    renderErrorPage(
      404,
      'Page not found',
      'The requested local report page does not exist.',
    ),
  );
}

function parsePipelineFailureStage(
  searchParams: URLSearchParams,
): PipelineStage | undefined {
  const values = searchParams.getAll('failure');
  if (values.length === 0) return undefined;
  if (values.length !== 1 || !isPipelineStage(values[0]))
    throw new ReportQueryError('Unknown pipeline failure stage.');
  return values[0];
}

function isPipelineStage(value: string | undefined): value is PipelineStage {
  return (
    value === 'configuration' ||
    value === 'collection' ||
    value === 'processing' ||
    value === 'recommendations'
  );
}

async function renderList(
  dependencies: LocalReportHandlerDependencies,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const query = parseRecommendationReportQuery({
    ...optionalParameter(url.searchParams, 'track', 'track'),
    ...optionalParameter(url.searchParams, 'status', 'status'),
    ...optionalParameter(url.searchParams, 'company', 'company'),
    ...optionalParameter(url.searchParams, 'minimumScore', 'minimumScore'),
    ...optionalParameter(url.searchParams, 'batch', 'batch'),
    ...optionalParameter(url.searchParams, 'sort', 'sort'),
  });
  const report = await dependencies.runtime.getReport.execute(query);
  sendHtml(
    response,
    200,
    renderRecommendationReport(
      report,
      noticeMessage(url.searchParams.get('notice')),
      getSourceReadiness(dependencies),
    ),
  );
}

function getSourceReadiness(
  dependencies: LocalReportHandlerDependencies,
): SourceReadinessReport {
  return dependencies.sourceReadiness ?? DEFAULT_SOURCE_READINESS;
}

function optionalParameter<Key extends string>(
  parameters: URLSearchParams,
  name: string,
  key: Key,
): Partial<Record<Key, string>> {
  const values = parameters.getAll(name);
  if (values.length > 1)
    throw new ReportQueryError(
      `Query parameter "${name}" may appear only once.`,
    );
  const value = values[0];
  return value === undefined ? {} : ({ [key]: value } as Record<Key, string>);
}

function requestBase(request: IncomingMessage): string {
  const host = request.headers.host;
  return `http://${host ?? '127.0.0.1'}`;
}

function requireSameOrigin(request: IncomingMessage): void {
  const localPort = request.socket.localPort;
  const expectedHost = `127.0.0.1:${localPort}`;
  if (request.headers.host !== expectedHost)
    throw new ReportQueryError(
      'The request Host does not match the local report.',
    );
  const origin = request.headers.origin;
  const refererOrigin = parseOrigin(request.headers.referer);
  if ((origin ?? refererOrigin) !== `http://${expectedHost}`)
    throw new ReportQueryError('Cross-origin mutations are not allowed.');
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin')
    throw new ReportQueryError('Cross-site mutations are not allowed.');
}

function parseOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const contentType = request.headers['content-type'];
  const contentLength = Number(request.headers['content-length'] ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_FORM_BYTES)
    throw new ReportQueryError('The submitted form is too large.');
  if (
    contentType !== undefined &&
    !contentType
      .toLocaleLowerCase('en-US')
      .startsWith('application/x-www-form-urlencoded')
  )
    throw new ReportQueryError('Forms must use URL-encoded content.');
  request.setEncoding('utf8');
  let body = '';
  let length = 0;
  for await (const chunk of request) {
    if (typeof chunk !== 'string')
      throw new ReportQueryError('The submitted form encoding is invalid.');
    length += Buffer.byteLength(chunk, 'utf8');
    if (length > MAX_FORM_BYTES)
      throw new ReportQueryError('The submitted form is too large.');
    body += chunk;
  }
  return new URLSearchParams(body);
}

function decodePathSegment(value: string | undefined): string {
  if (value === undefined) throw new RecommendationNotFoundError();
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.length === 0 || decoded.length > 200 || decoded.includes('/'))
      throw new RecommendationNotFoundError();
    return decoded;
  } catch (error: unknown) {
    if (error instanceof RecommendationNotFoundError) throw error;
    throw new RecommendationNotFoundError();
  }
}

function isUserStatus(value: string | null): value is UserApplicationStatus {
  return (
    value !== null &&
    USER_APPLICATION_STATUSES.some((status) => status === value)
  );
}

function noticeMessage(value: string | null): string | undefined {
  if (value === 'status-updated') return 'Application status updated.';
  if (value === 'pipeline-complete')
    return 'Pipeline run completed successfully.';
  return undefined;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');
}

function sendHtml(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    ...headers,
  });
  response.end(body);
}

function sendAsset(
  response: ServerResponse,
  contentType: string,
  body: string,
): void {
  response.setHeader('Cache-Control', 'private, max-age=300');
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(body);
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function redirect(
  response: ServerResponse,
  location: string,
  status = 302,
): void {
  response.writeHead(status, {
    Location: location,
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end('Redirecting.\n');
}

function safePath(value: string | undefined): string {
  if (value === undefined) return '/';
  try {
    return new URL(value, 'http://127.0.0.1').pathname;
  } catch {
    return '/invalid-request';
  }
}

export function mapWebError(error: unknown): {
  readonly status: number;
  readonly title: string;
  readonly message: string;
} {
  if (
    error instanceof ReportQueryError ||
    error instanceof ApplicationStatusError
  )
    return { status: 400, title: 'Invalid request', message: error.message };
  if (error instanceof RecommendationNotFoundError)
    return {
      status: 404,
      title: 'Recommendation not found',
      message: error.message,
    };
  if (error instanceof ActivePipelineRunError)
    return {
      status: 409,
      title: 'Pipeline already running',
      message: error.message,
    };
  return {
    status: 500,
    title: 'Unexpected error',
    message: 'The local report could not complete this request.',
  };
}
