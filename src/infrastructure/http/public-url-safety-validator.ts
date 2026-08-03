import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  CollectionError,
  type UrlSafetyValidator,
} from '../../application/index.js';

export interface AddressResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

export interface ValidatedConnectionTarget {
  readonly url: string;
  readonly hostname: string;
  readonly address: string;
  readonly family: 4 | 6;
}

export interface ConnectionBoundUrlValidator extends UrlSafetyValidator {
  resolveForConnection(
    url: string,
    allowTestLoopback: boolean,
  ): Promise<ValidatedConnectionTarget>;
}

class NodeAddressResolver implements AddressResolver {
  public async resolve(hostname: string): Promise<readonly string[]> {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => result.address);
  }
}

export class PublicUrlSafetyValidator implements ConnectionBoundUrlValidator {
  public constructor(
    private readonly resolver: AddressResolver = new NodeAddressResolver(),
  ) {}

  public async validate(
    value: string,
    allowTestLoopback: boolean,
  ): Promise<string> {
    return (await this.resolveForConnection(value, allowTestLoopback)).url;
  }

  public async resolveForConnection(
    value: string,
    allowTestLoopback: boolean,
  ): Promise<ValidatedConnectionTarget> {
    const url = parseUrl(value);
    if (url.username || url.password)
      throw unsafe('URL must not contain credentials.');

    const hostname = normalizeHostname(url.hostname);
    if (hostname.length === 0) throw unsafe('URL hostname is invalid.');
    if (isIP(hostname) !== 6) url.hostname = hostname;
    url.hash = '';

    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw unsafe('URL must use public HTTPS.');
    if (url.protocol === 'http:' && !allowTestLoopback)
      throw unsafe('URL must use public HTTPS.');

    const addresses = await resolveAddresses(this.resolver, hostname);
    const normalized = normalizeAddresses(addresses);
    if (normalized.length === 0)
      throw resolutionFailure('DNS resolution returned no addresses.');

    const testLoopback = normalized.every((item) =>
      isLoopbackAddress(item.address),
    );
    if (url.protocol === 'http:' && (!allowTestLoopback || !testLoopback))
      throw unsafe('Test HTTP URLs must resolve only to loopback.');

    for (const item of normalized) {
      const allowedTestAddress = allowTestLoopback && testLoopback;
      if (!allowedTestAddress && isNonPublicAddress(item.address))
        throw unsafe('URL resolved to a non-public network address.');
    }

    const selected = normalized[0];
    if (selected === undefined)
      throw resolutionFailure('DNS resolution returned no addresses.');
    return {
      url: url.toString(),
      hostname,
      address: selected.address,
      family: selected.family,
    };
  }
}

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (cause: unknown) {
    throw new CollectionError(
      'URL_UNSAFE',
      'URL is malformed.',
      { retryable: false },
      { cause },
    );
  }
}

async function resolveAddresses(
  resolver: AddressResolver,
  hostname: string,
): Promise<readonly string[]> {
  if (isIP(hostname) !== 0) return [hostname];
  try {
    return await resolver.resolve(hostname);
  } catch (cause: unknown) {
    throw new CollectionError(
      'DNS_RESOLUTION_FAILED',
      'Source hostname could not be resolved safely.',
      { retryable: true },
      { cause },
    );
  }
}

function normalizeAddresses(
  values: readonly string[],
): readonly { readonly address: string; readonly family: 4 | 6 }[] {
  const unique = new Map<
    string,
    { readonly address: string; readonly family: 4 | 6 }
  >();
  for (const value of values) {
    const rawAddress = stripBrackets(value).toLocaleLowerCase('en-US');
    const family = isIP(rawAddress);
    if (family !== 4 && family !== 6)
      throw resolutionFailure('DNS resolution returned an invalid address.');
    const address =
      family === 6
        ? stripBrackets(new URL(`http://[${rawAddress}]/`).hostname)
        : rawAddress;
    unique.set(`${family}:${address}`, { address, family });
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  );
}

function normalizeHostname(value: string): string {
  const hostname = stripBrackets(value)
    .toLocaleLowerCase('en-US')
    .replace(/\.+$/u, '');
  return hostname;
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
      (first === 192 && second === 0 && (parts[2] === 0 || parts[2] === 2)) ||
      (first === 192 && second === 168) ||
      (first === 198 &&
        (second === 18 ||
          second === 19 ||
          (second === 51 && parts[2] === 100))) ||
      (first === 203 && second === 0 && parts[2] === 113) ||
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
      normalized === '100::' ||
      normalized.startsWith('100::') ||
      normalized === '2001:db8::' ||
      normalized.startsWith('2001:db8:') ||
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

function resolutionFailure(message: string): CollectionError {
  return new CollectionError('DNS_RESOLUTION_FAILED', message, {
    retryable: true,
  });
}
