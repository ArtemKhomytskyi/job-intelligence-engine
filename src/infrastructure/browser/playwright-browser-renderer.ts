import { chromium, type Browser } from 'playwright';

import {
  CollectionError,
  type BrowserPageRenderer,
  type BrowserRenderRequest,
  type BrowserRenderResult,
  type Clock,
  type UrlSafetyValidator,
} from '../../application/index.js';
import { shouldBlockBrowserResource } from './resource-policy.js';

const MAX_BROWSER_REQUESTS = 100;
const MAX_POPUPS = 4;
const MAX_CHILD_FRAMES = 0;

export type BrowserLauncher = () => Promise<Browser>;

export class PlaywrightBrowserRenderer implements BrowserPageRenderer {
  private browser: Browser | undefined;
  public constructor(
    private readonly urlValidator: UrlSafetyValidator,
    private readonly clock: Clock,
    private readonly launchBrowser: BrowserLauncher = () =>
      chromium.launch({ headless: true }),
  ) {}

  public async render(
    request: BrowserRenderRequest,
  ): Promise<BrowserRenderResult> {
    if (!request.allowTestLoopback || !isExplicitLoopbackUrl(request.url))
      throw new CollectionError(
        'BROWSER_FALLBACK_NOT_PERMITTED',
        'Browser fallback is permitted only for explicit loopback test fixtures.',
        { endpoint: safeEndpoint(request.url), retryable: false },
      );
    const safeUrl = await this.urlValidator.validate(
      request.url,
      request.allowTestLoopback,
    );
    const allowedOrigin = new URL(safeUrl).origin;
    const started = this.clock.now().getTime();
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      acceptDownloads: false,
      javaScriptEnabled: true,
      permissions: [],
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    let blockedResourceCount = 0;
    let requestCount = 0;
    let popupCount = 0;
    let childFrameCount = 0;
    const budget = { exceeded: false };
    const cancel = (): void => {
      void page.close();
    };
    request.signal.addEventListener('abort', cancel, { once: true });
    try {
      page.setDefaultNavigationTimeout(request.timeoutMs);
      page.setDefaultTimeout(request.timeoutMs);
      page.on('dialog', (dialog) => {
        void dialog.dismiss();
      });
      context.on('page', (popup) => {
        popupCount += 1;
        blockedResourceCount += 1;
        if (popupCount > MAX_POPUPS) budget.exceeded = true;
        void popup.close();
      });
      page.on('frameattached', (frame) => {
        if (frame.parentFrame() === null) return;
        childFrameCount += 1;
        blockedResourceCount += 1;
        if (childFrameCount > MAX_CHILD_FRAMES) {
          budget.exceeded = true;
          void page.close();
        }
      });
      await context.routeWebSocket('**/*', (webSocket) => {
        blockedResourceCount += 1;
        void webSocket.close();
      });
      await context.route('**/*', async (route) => {
        requestCount += 1;
        const resourceType = route.request().resourceType();
        const method = route.request().method();
        if (
          requestCount > MAX_BROWSER_REQUESTS ||
          shouldBlockBrowserResource(resourceType) ||
          (method !== 'GET' && method !== 'HEAD') ||
          !isAllowedLoopbackRequest(route.request().url(), allowedOrigin)
        ) {
          if (requestCount > MAX_BROWSER_REQUESTS) budget.exceeded = true;
          blockedResourceCount += 1;
          await route.abort();
          return;
        }
        try {
          await this.urlValidator.validate(
            route.request().url(),
            request.allowTestLoopback,
          );
          await route.continue();
        } catch {
          blockedResourceCount += 1;
          await route.abort();
        }
      });
      await page.goto(safeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: request.timeoutMs,
      });
      await page
        .waitForLoadState('networkidle', {
          timeout: Math.min(request.timeoutMs, 5_000),
        })
        .catch(() => undefined);
      if (budget.exceeded)
        throw new CollectionError(
          'BROWSER_RENDER_FAILED',
          'Browser fixture exceeded its request, popup, or frame budget.',
          { endpoint: safeEndpoint(safeUrl), retryable: false },
        );
      const finalUrl = await this.urlValidator.validate(
        page.url(),
        request.allowTestLoopback,
      );
      if (!isAllowedLoopbackRequest(finalUrl, allowedOrigin))
        throw new CollectionError(
          'BROWSER_FALLBACK_NOT_PERMITTED',
          'Browser fallback left the permitted loopback fixture origin.',
          { endpoint: safeEndpoint(finalUrl), retryable: false },
        );
      const html = await page.content();
      if (new TextEncoder().encode(html).byteLength > request.maximumHtmlBytes)
        throw new CollectionError(
          'HTML_RESPONSE_TOO_LARGE',
          'Rendered HTML exceeded the size limit.',
          { endpoint: safeEndpoint(finalUrl), retryable: false },
        );
      return {
        finalUrl,
        html,
        durationMs: Math.max(0, this.clock.now().getTime() - started),
        blockedResourceCount,
      };
    } catch (cause: unknown) {
      if (cause instanceof CollectionError) throw cause;
      if (request.signal.aborted)
        throw new CollectionError(
          'COLLECTION_ABORTED',
          'Collection was cancelled.',
          { endpoint: safeEndpoint(safeUrl), retryable: false },
          { cause },
        );
      if (isTimeout(cause))
        throw new CollectionError(
          'BROWSER_TIMEOUT',
          'Browser rendering timed out.',
          { endpoint: safeEndpoint(safeUrl), retryable: false },
          { cause },
        );
      throw new CollectionError(
        'BROWSER_RENDER_FAILED',
        'Browser rendering failed.',
        { endpoint: safeEndpoint(safeUrl), retryable: false },
        { cause },
      );
    } finally {
      request.signal.removeEventListener('abort', cancel);
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  public async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (browser !== undefined) await browser.close();
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser !== undefined && this.browser.isConnected())
      return this.browser;
    try {
      this.browser = await this.launchBrowser();
      return this.browser;
    } catch (cause: unknown) {
      throw new CollectionError(
        'BROWSER_UNAVAILABLE',
        'Chromium browser fallback is unavailable.',
        { retryable: false },
        { cause },
      );
    }
  }
}

function isAllowedLoopbackRequest(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === origin && isExplicitLoopbackUrl(value);
  } catch {
    return false;
  }
}

function isExplicitLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase('en-US');
    return (
      url.protocol === 'http:' &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function safeEndpoint(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'invalid-source-url';
  }
}

function isTimeout(value: unknown): boolean {
  return value instanceof Error && /timeout/iu.test(value.message);
}
