import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260821080000_sync_goal_and_template_sequences.sql?raw";

/**
 * Static assertions against the unapplied sequence-repair migration's
 * actual SQL text — the closest available proof of its behavior since
 * there is no live database in this environment. The branching logic
 * itself (null max(id) -> setval(seq, 1, false); otherwise ->
 * setval(seq, max_id, true)) is also proven executable in
 * tests/sequenceSync.test.js against a pure JS mirror.
 */

describe("sequence sync migration: never hardcodes an id value", () => {
  it("computes each sequence's target from a freshly-selected max(id), not a literal", () => {
    expect(migrationSql).toMatch(/select max\(id\) into v_max_goal_id from public\.county_records_request_goals;/);
    expect(migrationSql).toMatch(/select max\(id\) into v_max_template_id from public\.records_request_goal_templates;/);
  });

  it("never hardcodes the number 10 (the value Codex's live repair produced) as a setval target", () => {
    expect(migrationSql).not.toMatch(/setval\([^)]*,\s*10\s*[,)]/);
  });
});

describe("sequence sync migration: empty vs. populated table branch to different setval() calls", () => {
  it("an empty table (max(id) is null) calls setval(seq, 1, false) — not is_called = true", () => {
    expect(migrationSql).toMatch(
      /if v_max_goal_id is null then\s*\n\s*perform setval\('public\.county_records_request_goals_id_seq', 1, false\);/,
    );
    expect(migrationSql).toMatch(
      /if v_max_template_id is null then\s*\n\s*perform setval\('public\.records_request_goal_templates_id_seq', 1, false\);/,
    );
  });

  it("a populated table calls setval(seq, max_id, true), never a coalesced literal", () => {
    expect(migrationSql).toMatch(
      /else\s*\n\s*perform setval\('public\.county_records_request_goals_id_seq', v_max_goal_id, true\);/,
    );
    expect(migrationSql).toMatch(
      /else\s*\n\s*perform setval\('public\.records_request_goal_templates_id_seq', v_max_template_id, true\);/,
    );
  });

  it("never uses a single coalesce(..., 1)-with-is_called=true call, which would be wrong for a genuinely empty table", () => {
    // The verification select at the bottom of the file legitimately uses
    // coalesce() for a read-only sanity check — only the setval-branching
    // block itself must never fall back to a coalesced literal.
    const setvalBlock = migrationSql.slice(migrationSql.indexOf("do $$\ndeclare"), migrationSql.indexOf("commit;"));
    expect(setvalBlock).not.toMatch(/coalesce/);
  });
});

describe("sequence sync migration: idempotent, never mutates goal/template rows", () => {
  it("is idempotent — re-running recomputes the same or a still-correct target, never errors", () => {
    // Idempotency comes from always deriving the target from a fresh
    // max(id) query rather than asserting a one-time delta, so this is
    // proven by the absence of any INSERT/UPDATE/DELETE against the goal
    // or template tables themselves (a pure read-then-setval migration).
    expect(migrationSql).not.toMatch(/insert into public\.(county_records_request_goals|records_request_goal_templates)/i);
    expect(migrationSql).not.toMatch(/update public\.(county_records_request_goals|records_request_goal_templates)/i);
    expect(migrationSql).not.toMatch(/delete from public\.(county_records_request_goals|records_request_goal_templates)/i);
  });
});

describe("sequence sync migration: precondition safety and transaction wrapping", () => {
  it("fails fast if either table or sequence does not exist, rather than creating one", () => {
    expect(migrationSql).toMatch(/if to_regclass\('public\.county_records_request_goals'\) is null then/);
    expect(migrationSql).toMatch(/if to_regclass\('public\.records_request_goal_templates'\) is null then/);
    expect(migrationSql).toMatch(/if to_regclass\('public\.county_records_request_goals_id_seq'\) is null then/);
    expect(migrationSql).toMatch(/if to_regclass\('public\.records_request_goal_templates_id_seq'\) is null then/);
    expect(migrationSql).not.toMatch(/create sequence/i);
  });

  it("wraps writes in a single transaction", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
  });
});
