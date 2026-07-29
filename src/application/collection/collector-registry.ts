import { CollectionError } from './errors.js';
import type { CollectorSourceType } from './models.js';
import type { JobCollector } from './ports.js';

export class CollectorRegistry {
  readonly #collectors: ReadonlyMap<CollectorSourceType, JobCollector>;

  public constructor(collectors: readonly JobCollector[]) {
    const registered = new Map<CollectorSourceType, JobCollector>();
    for (const collector of collectors) {
      if (registered.has(collector.sourceType)) {
        throw new CollectionError(
          'SOURCE_CONFIGURATION_INVALID',
          `Collector type "${collector.sourceType}" is registered more than once.`,
        );
      }
      registered.set(collector.sourceType, collector);
    }
    this.#collectors = registered;
  }

  public resolve(sourceType: CollectorSourceType): JobCollector {
    const collector = this.#collectors.get(sourceType);
    if (collector === undefined) {
      throw new CollectionError(
        'COLLECTOR_NOT_FOUND',
        `No collector is registered for source type "${sourceType}".`,
        { sourceType },
      );
    }
    return collector;
  }

  public supportedTypes(): readonly CollectorSourceType[] {
    return Object.freeze([...this.#collectors.keys()]);
  }
}
