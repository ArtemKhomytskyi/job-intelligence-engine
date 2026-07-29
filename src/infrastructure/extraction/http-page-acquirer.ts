import type {
  HtmlPageAcquirer,
  HtmlPage,
  HttpClient,
  HttpRequest,
} from '../../application/index.js';

export class HttpPageAcquirer implements HtmlPageAcquirer {
  public constructor(private readonly http: HttpClient) {}
  public async acquire(request: HttpRequest): Promise<HtmlPage> {
    const response = await this.http.getText(request);
    return {
      requestedUrl: request.url,
      finalUrl: response.finalUrl,
      html: response.data,
      status: response.status,
      requestCount: response.attempts + response.redirectCount,
      redirectCount: response.redirectCount,
      rendered: false,
      blockedResourceCount: 0,
    };
  }
}
