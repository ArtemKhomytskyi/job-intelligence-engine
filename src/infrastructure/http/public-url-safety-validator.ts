import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  CollectionError,
  type UrlSafetyValidator,
} from '../../application/index.js';

export interface AddressResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

class NodeAddressResolver implements AddressResolver {
  public async resolve(hostname: string): Promise<readonly string[]> {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => result.address);
  }
}

export class PublicUrlSafetyValidator implements UrlSafetyValidator {
  public constructor(
    private readonly resolver: AddressResolver = new NodeAddressResolver(),
  ) {}

  public async validate(
    value: string,
    allowTestLoopback: boolean,
  ): Promise<string> {
    let url: URL;
    try {
      url = new URL(value);
    } catch (cause: unknown) {
      throw new CollectionError(
        'URL_UNSAFE',
        'URL is malformed.',
        { retryable: false },
        { cause },
      );
    }
    if (url.username || url.password)
      throw unsafe('URL must not contain credentials.');
    const hostname = stripBrackets(url.hostname).toLocaleLowerCase('en-US');
    const loopbackHost =
      hostname === 'localhost' || isLoopbackAddress(hostname);
    if (
      url.protocol !== 'https:' &&
      !(allowTestLoopback && url.protocol === 'http:' && loopbackHost)
    )
      throw unsafe('URL must use public HTTPS.');
    if (loopbackHost) {
      if (!allowTestLoopback) throw unsafe('Loopback URLs are not allowed.');
    } else {
      const addresses =
        isIP(hostname) === 0
          ? await this.resolver.resolve(hostname)
          : [hostname];
      if (addresses.length === 0 || addresses.some(isNonPublicAddress))
        throw unsafe('URL resolved to a non-public network address.');
    }
    url.hash = '';
    return url.toString();
  }
}

function stripBrackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value;
}

function isLoopbackAddress(value: string): boolean {
  return value === '::1' || value.startsWith('127.');
}

function isNonPublicAddress(value: string): boolean {
  const normalized = stripBrackets(value).toLocaleLowerCase('en-US');
  if (isLoopbackAddress(normalized)) return true;
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      first >= 224
    );
  }
  if (isIP(normalized) === 6) {
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(normalized);
    if (mapped !== null) {
      const high = Number.parseInt(mapped[1] ?? '0', 16);
      const low = Number.parseInt(mapped[2] ?? '0', 16);
      return isNonPublicAddress(
        `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
      );
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  return true;
}

function unsafe(message: string): CollectionError {
  return new CollectionError('URL_UNSAFE', message, { retryable: false });
}
