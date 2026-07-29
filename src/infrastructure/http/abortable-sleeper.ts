import type { Sleeper } from '../../application/index.js';
import { CollectionError } from '../../application/index.js';

export class AbortableSleeper implements Sleeper {
  public sleep(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, delayMs);
      signal.addEventListener('abort', cancel, { once: true });
      function done(): void {
        signal.removeEventListener('abort', cancel);
        resolve();
      }
      function cancel(): void {
        clearTimeout(timer);
        reject(aborted());
      }
    });
  }
}

function aborted(): CollectionError {
  return new CollectionError(
    'COLLECTION_ABORTED',
    'Collection was cancelled.',
    {
      retryable: false,
    },
  );
}
