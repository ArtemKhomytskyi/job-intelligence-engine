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

export class PlaywrightBrowserRenderer implements BrowserPageRenderer {
  private browser: Browser | undefined;
  public constructor(
    private readonly urlValidator: UrlSafetyValidator,
    private readonly clock: Clock,
  ) {}

  public async render(
    request: BrowserRenderRequest,
  ): Promise<BrowserRenderResult> {
    const safeUrl = await this.urlValidator.validate(
      request.url,
      request.allowTestLoopback,
    );
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
      await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        if (shouldBlockBrowserResource(resourceType)) {
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
      const finalUrl = await this.urlValidator.validate(
        page.url(),
        request.allowTestLoopback,
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
      this.browser = await chromium.launch({ headless: true });
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

function safeEndpoint(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function isTimeout(value: unknown): boolean {
  return value instanceof Error && /timeout/iu.test(value.message);
}
