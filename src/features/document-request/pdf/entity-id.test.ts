import { describe, expect, it } from "vitest";
import { entityIdSchema, InvalidEntityIdError, normalizeEntityId, sameGovernmentEntity } from "./entity-id";

describe("normalizeEntityId", () => {
  it("normalizes live positive bigint government-entity IDs from numbers", () => {
    expect(normalizeEntityId(4)).toBe("4");
    expect(normalizeEntityId(5)).toBe("5");
  });

  it("normalizes positive integer strings", () => {
    expect(normalizeEntityId("4")).toBe("4");
    expect(normalizeEntityId(" 4 ")).toBe("4");
  });

  it("normalizes positive bigint values", () => {
    expect(normalizeEntityId(4n)).toBe("4");
  });

  it("rejects zero, negative, and non-integer numbers", () => {
    expect(() => normalizeEntityId(0)).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId(-4)).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId(4.5)).toThrow(InvalidEntityIdError);
  });

  it("rejects numbers outside JavaScript's safe integer range", () => {
    expect(() => normalizeEntityId(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidEntityIdError);
  });

  it("rejects non-numeric or malformed strings", () => {
    expect(() => normalizeEntityId("abc")).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId("04")).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId("-4")).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId("")).toThrow(InvalidEntityIdError);
  });

  it("rejects unsupported types", () => {
    expect(() => normalizeEntityId(null)).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId(undefined)).toThrow(InvalidEntityIdError);
    expect(() => normalizeEntityId({})).toThrow(InvalidEntityIdError);
  });
});

describe("sameGovernmentEntity", () => {
  it("treats a live bigint and its string form as the same entity", () => {
    expect(sameGovernmentEntity(4, "4")).toBe(true);
  });

  it("distinguishes different entities", () => {
    expect(sameGovernmentEntity(4, 5)).toBe(false);
  });
});

describe("entityIdSchema", () => {
  it("accepts positive bigint strings", () => {
    expect(entityIdSchema.safeParse("4").success).toBe(true);
    expect(entityIdSchema.safeParse("5").success).toBe(true);
  });

  it("accepts valid UUIDs (used by the engine's own generic test fixtures)", () => {
    expect(entityIdSchema.safeParse("10000000-0000-4000-8000-000000000001").success).toBe(true);
  });

  it("rejects arbitrary identifiers", () => {
    expect(entityIdSchema.safeParse("murfreesboro").success).toBe(false);
    expect(entityIdSchema.safeParse("entity-4").success).toBe(false);
    expect(entityIdSchema.safeParse("4; drop table request_profiles;").success).toBe(false);
    expect(entityIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects non-positive or zero-padded integer strings", () => {
    expect(entityIdSchema.safeParse("0").success).toBe(false);
    expect(entityIdSchema.safeParse("-4").success).toBe(false);
    expect(entityIdSchema.safeParse("04").success).toBe(false);
  });

  it("rejects a malformed near-UUID", () => {
    expect(entityIdSchema.safeParse("10000000-0000-4000-8000-00000000000").success).toBe(false);
    expect(entityIdSchema.safeParse("not-a-uuid-at-all-000000000000").success).toBe(false);
  });
});
