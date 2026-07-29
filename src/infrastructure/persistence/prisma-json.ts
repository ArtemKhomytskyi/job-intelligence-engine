import { Prisma } from '@prisma/client';

import type { JsonValue } from '../../domain/index.js';

export function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }
  const converted = toNestedPrismaJson(value);
  return converted === null ? Prisma.JsonNull : converted;
}

function toNestedPrismaJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toNestedPrismaJson(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        toNestedPrismaJson(item),
      ]),
    );
  }
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  throw new TypeError('JSON input contains an unsupported value.');
}

export function fromPrismaJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(fromPrismaJson);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fromPrismaJson(item)]),
    );
  }
  throw new TypeError('Database JSON contains an unsupported value.');
}
