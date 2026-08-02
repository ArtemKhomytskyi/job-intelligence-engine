export { runCli } from './cli/run-cli.js';
export {
  formatConfigurationErrors,
  formatConfigurationSummary,
  formatHelp,
} from './cli/output.js';
export { formatProcessingSummary } from './cli/process-command.js';
export { formatRecommendationBatch } from './cli/recommend-command.js';
export { formatFullPipelineResult } from './cli/run-command.js';
export { validateServerOptions } from './cli/serve-command.js';
export {
  createLocalReportHandler,
  mapWebError,
} from './web/local-report-handler.js';
