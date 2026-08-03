import {
  CollectorRegistry,
  GenericExtractionEngine,
  GenericWebCollector,
  type Clock,
  type HttpClient,
  type Logger,
} from '../../application/index.js';
import {
  CareerPageAtsCollector,
  CheerioDocumentExtractor,
  GreenhouseCollector,
  HttpPageAcquirer,
  LeverCollector,
  type PlaywrightBrowserRenderer,
  createAshbyCollector,
  createRecruiteeCollector,
  createSmartRecruitersCollector,
} from '../../infrastructure/index.js';

export function createCollectorRegistry(input: {
  readonly http: HttpClient;
  readonly clock: Clock;
  readonly browser: PlaywrightBrowserRenderer;
  readonly logger: Logger;
}): CollectorRegistry {
  const extraction = new GenericExtractionEngine(
    new HttpPageAcquirer(input.http),
    new CheerioDocumentExtractor(),
    input.browser,
    input.logger,
  );
  const genericPage = new GenericWebCollector(
    'generic-page',
    extraction,
    input.clock,
  );
  const genericList = new GenericWebCollector(
    'generic-job-list',
    extraction,
    input.clock,
  );
  return new CollectorRegistry([
    new GreenhouseCollector(input.http, input.clock),
    new LeverCollector(input.http, input.clock),
    createAshbyCollector(input.http, input.clock),
    createSmartRecruitersCollector(input.http, input.clock),
    createRecruiteeCollector(input.http, input.clock),
    new CareerPageAtsCollector('workable', genericList, input.clock),
    new CareerPageAtsCollector('bamboohr', genericList, input.clock),
    new CareerPageAtsCollector('teamtailor', genericList, input.clock),
    new CareerPageAtsCollector('personio', genericList, input.clock),
    new CareerPageAtsCollector('jobvite', genericList, input.clock),
    genericPage,
    genericList,
  ]);
}
