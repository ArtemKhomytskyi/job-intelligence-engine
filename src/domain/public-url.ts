export type PublicUrlFailureCode =
  'INVALID_URL' | 'HTTPS_REQUIRED' | 'CREDENTIALS_NOT_ALLOWED';

export type PublicUrlNormalizationResult =
  | { readonly status: 'SUCCESS'; readonly value: string }
  | { readonly status: 'FAILED'; readonly code: PublicUrlFailureCode };

export interface PublicUrlNormalizationOptions {
  readonly removableParameters?: readonly string[];
  readonly normalizeTrailingSlash?: boolean;
  readonly sortQueryParameters?: boolean;
}

export function normalizePublicUrlValue(
  value: string,
  options: PublicUrlNormalizationOptions = {},
): PublicUrlNormalizationResult {
  if (value.length > 10_000) return { status: 'FAILED', code: 'INVALID_URL' };
  let url: URL;
  try {
    url = new URL(value.normalize('NFKC').trim());
  } catch {
    return { status: 'FAILED', code: 'INVALID_URL' };
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    return { status: 'FAILED', code: 'HTTPS_REQUIRED' };
  if (url.username.length > 0 || url.password.length > 0)
    return { status: 'FAILED', code: 'CREDENTIALS_NOT_ALLOWED' };
  url.hash = '';
  for (const parameter of options.removableParameters ?? [])
    url.searchParams.delete(parameter);
  if (options.normalizeTrailingSlash === true && url.pathname.length > 1)
    url.pathname = url.pathname.replace(/\/+$/u, '');
  if (options.sortQueryParameters === true) url.searchParams.sort();
  return { status: 'SUCCESS', value: url.toString() };
}
