import { z } from "zod";

/**
 * Government-entity identifiers are typed columns in the generator's Zod
 * schemas but are not required to be UUIDs: the live schema uses positive
 * bigint IDs (see government_entities.id). This module is the single place
 * that normalizes an entity ID into one string representation so profile,
 * goal, and entity identifiers can be compared consistently regardless of
 * whether they originated as a Postgres bigint (number/string) or a
 * synthetic UUID used by generic engine tests.
 *
 * entityIdSchema is intentionally narrow: it accepts only a positive
 * integer string (the live bigint representation) or a UUID (the format
 * used by the engine's own generic test fixtures). It never accepts an
 * arbitrary identifier string.
 */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const entityIdSchema = z
  .string()
  .refine((value) => POSITIVE_INTEGER_PATTERN.test(value) || UUID_PATTERN.test(value), {
    message: "Government entity IDs must be a positive integer string or a UUID.",
  });

export type EntityId = z.infer<typeof entityIdSchema>;

export class InvalidEntityIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEntityIdError";
  }
}

/**
 * Normalizes a live government-entity ID (a positive Postgres bigint,
 * returned by supabase-js as a number or numeric string) into the string
 * representation used throughout the generator. Rejects anything that is
 * not a positive integer so a malformed row fails loudly instead of being
 * silently coerced.
 */
export function normalizeEntityId(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new InvalidEntityIdError(`Government entity IDs must be positive safe integers, received ${value}.`);
    }
    return String(value);
  }

  if (typeof value === "bigint") {
    if (value <= 0n) {
      throw new InvalidEntityIdError(`Government entity IDs must be positive integers, received ${value}.`);
    }
    return value.toString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) {
      throw new InvalidEntityIdError(`Government entity IDs must be positive integer strings, received "${value}".`);
    }
    return trimmed;
  }

  throw new InvalidEntityIdError(`Government entity IDs must be a number or string, received ${typeof value}.`);
}

/**
 * Confirms two raw entity-ID values (from a profile row, a goal row, and an
 * entity row, in any combination) refer to the same government entity after
 * normalization.
 */
export function sameGovernmentEntity(a: unknown, b: unknown): boolean {
  return normalizeEntityId(a) === normalizeEntityId(b);
}
