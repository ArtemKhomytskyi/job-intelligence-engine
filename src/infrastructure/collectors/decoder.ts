import { z } from 'zod';
import { CollectionError, type JsonDecoder } from '../../application/index.js';

export class ZodSourceDecoder<T> implements JsonDecoder<T> {
  public constructor(private readonly schema: z.ZodType<T>) {}
  public decode(input: unknown): T {
    const result = this.schema.safeParse(input);
    if (!result.success)
      throw new CollectionError(
        'SOURCE_RESPONSE_INVALID',
        'The source response shape was invalid.',
        { retryable: false },
        { cause: result.error },
      );
    return result.data;
  }
}
