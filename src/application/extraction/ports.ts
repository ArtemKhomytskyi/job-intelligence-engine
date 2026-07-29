import type { HttpRequest } from '../collection/ports.js';
import type {
  BrowserRenderRequest,
  BrowserRenderResult,
  HtmlPage,
  PageExtractionResult,
} from './models.js';

export interface HtmlPageAcquirer {
  acquire(request: HttpRequest): Promise<HtmlPage>;
}

export interface HtmlDocumentExtractor {
  extract(
    html: string,
    finalUrl: string,
    configuredCompany: string,
    maximumLinks: number,
  ): PageExtractionResult;
}

export interface BrowserPageRenderer {
  render(request: BrowserRenderRequest): Promise<BrowserRenderResult>;
  close(): Promise<void>;
}
