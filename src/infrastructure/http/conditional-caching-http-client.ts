import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

import {
  CollectionError,
  type HttpClient,
  type HttpJsonResponse,
  type HttpRequest,
  type HttpTextResponse,
  type JsonDecoder,
} from '../../application/index.js';

export class ConditionalCachingHttpClient implements HttpClient {
  public constructor(
    private readonly delegate: HttpClient,
    private readonly client: PrismaClient,
  ) {}

  public async getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>> {
    const requestWithAccept = {
      ...request,
      headers: { accept: 'application/json', ...request.headers },
    };
    let response = await this.getText(requestWithAccept);
    let parsed: unknown;
    try {
      parsed = parseJson(response.data);
    } catch (error: unknown) {
      if (!(error instanceof CollectionError) || response.notModified !== true)
        throw error;
      await this.client.httpCollectionCache.delete({
        where: { key: cacheKey(request.url) },
      });
      response = await this.getText(requestWithAccept);
      parsed = parseJson(response.data);
    }
    return { ...response, data: decoder.decode(parsed) };
  }

  public async getText(request: HttpRequest): Promise<HttpTextResponse> {
    const key = cacheKey(request.url);
    const cached = await this.client.httpCollectionCache.findUnique({
      where: { key },
    });
    const response = await this.delegate.getText({
      ...request,
      headers: {
        ...request.headers,
        ...(cached?.etag === null || cached?.etag === undefined
          ? {}
          : { 'if-none-match': cached.etag }),
        ...(cached?.lastModified === null || cached?.lastModified === undefined
          ? {}
          : { 'if-modified-since': cached.lastModified }),
      },
    });
    if (response.notModified === true && cached !== null)
      return {
        ...response,
        data: cached.responseBody,
        finalUrl: cached.finalUrl,
      };
    if (response.status >= 200 && response.status < 300) {
      await this.client.httpCollectionCache.upsert({
        where: { key },
        create: {
          key,
          responseBody: response.data,
          etag: response.headers?.etag ?? null,
          lastModified: response.headers?.['last-modified'] ?? null,
          finalUrl: response.finalUrl,
          status: response.status,
          fetchedAt: new Date(),
        },
        update: {
          responseBody: response.data,
          etag: response.headers?.etag ?? null,
          lastModified: response.headers?.['last-modified'] ?? null,
          finalUrl: response.finalUrl,
          status: response.status,
          fetchedAt: new Date(),
        },
      });
    }
    return response;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (cause: unknown) {
    throw new CollectionError(
      'HTTP_INVALID_JSON',
      'HTTP response was not valid JSON.',
      { retryable: false },
      { cause },
    );
  }
}

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
