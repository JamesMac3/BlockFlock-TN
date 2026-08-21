import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260821060801_chapter_master_accounts_and_posts.sql?raw";

/**
 * Static assertions against the unapplied chapter-master accounts/posts
 * migration's actual SQL text — the closest available proof of its
 * behavior since there is no live database in this environment.
 */

describe("chapter accounts migration: forwarding_email", () => {
  it("adds forwarding_email as a new column, never replacing an existing one", () => {
    expect(migrationSql).toMatch(/alter table public\.portal_accounts add column if not exists forwarding_email text;/);
  });

  it("validates the forwarding email shape with a CHECK constraint", () => {
    expect(migrationSql).toMatch(/portal_accounts_forwarding_email_check/);
  });

  it("normalizes (lowercases/trims) the email in both the self and admin setters", () => {
    const setterCount = [...migrationSql.matchAll(/lower\(trim\(p_email\)\)/g)].length;
    expect(setterCount).toBe(2);
  });
});

describe("chapter accounts migration: rrg_admin_list_chapter_accounts", () => {
  const fnBody = migrationSql.match(/create or replace function public\.rrg_admin_list_chapter_accounts\(([\s\S]*?)\n\$\$;/)?.[0] ?? "";

  it("resolves the login email via auth.users, selecting only email", () => {
    expect(migrationSql).toMatch(/left join auth\.users as auth_user on auth_user\.id = account\.user_id/);
    expect(migrationSql).toMatch(/auth_user\.email/);
  });

  it("never selects any other auth.users column (password hash, tokens, identities, raw metadata)", () => {
    expect(fnBody.length).toBeGreaterThan(0);
    for (const forbidden of [
      "encrypted_password",
      "raw_user_meta_data",
      "raw_app_meta_data",
      "confirmation_token",
      "recovery_token",
      "auth_user.identities",
      "auth_user.provider",
    ]) {
      expect(fnBody).not.toContain(forbidden);
    }
  });

  it("is admin-only", () => {
    expect(fnBody).toMatch(/admin_account\.role = 'admin'/);
    expect(fnBody).toMatch(/admin_account\.status = 'active'/);
  });

  it("is server-side paginated with a hard maximum of 100 rows per page", () => {
    expect(fnBody).toMatch(/v_page_size integer := least\(greatest\(coalesce\(p_page_size, 25\), 1\), 100\);/);
    expect(fnBody).toMatch(/limit v_page_size\s*\n\s*offset \(v_page - 1\) \* v_page_size;/);
  });

  it("returns the total filtered count via a window function, not a second query", () => {
    expect(fnBody).toMatch(/count\(\*\) over\(\) as total_count/);
  });

  it("filters by county, account state, and a search term across county/login/forwarding email", () => {
    expect(fnBody).toMatch(/p_county_id is null or account\.county_id = p_county_id/);
    expect(fnBody).toMatch(/p_state = 'trusted' and account\.status = 'active' and account\.review_required = false/);
    expect(fnBody).toMatch(/p_state = 'restricted' and account\.status = 'active' and account\.review_required = true/);
    expect(fnBody).toMatch(/p_state = 'suspended' and account\.status = 'suspended'/);
    expect(fnBody).toMatch(/county\.name ilike '%' \|\| v_search \|\| '%'/);
  });

  it("returns password_rotated_at for the 'last password rotation' column", () => {
    expect(fnBody).toContain("account.password_rotated_at,");
  });
});

describe("chapter accounts migration: account-status RPC is DB-only, never a direct suspend/restore UI path", () => {
  it("restricts rrg_admin_set_account_status to exactly active/suspended", () => {
    expect(migrationSql).toMatch(/if p_status not in \('active', 'suspended'\) then/);
  });

  it("refuses to suspend an admin account through this function", () => {
    expect(migrationSql).toMatch(/v_target\.role = 'admin' and p_status = 'suspended'/);
  });

  it("audits with the existing security_audit_events shape only (actor_user_id, county_id, event_type, target_table, target_id, event_data)", () => {
    const inserts = [...migrationSql.matchAll(/insert into public\.security_audit_events \(([\s\S]*?)\) values/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const match of inserts) {
      expect(match[1].replace(/\s+/g, " ").trim()).toBe(
        "actor_user_id, county_id, event_type, target_table, target_id, event_data",
      );
    }
  });

  it("logs trusted/restricted and suspended/restored with the expected event_type values", () => {
    expect(migrationSql).toContain("'chapter_master_marked_trusted'");
    expect(migrationSql).toContain("'chapter_master_marked_restricted'");
    expect(migrationSql).toContain("'chapter_master_suspended'");
    expect(migrationSql).toContain("'chapter_master_restored'");
  });
});

describe("chapter accounts migration: rrg_submit_post", () => {
  const fnBody = migrationSql.match(/create or replace function public\.rrg_submit_post\(p_post_id bigint\)[\s\S]*?\nend;\n\$\$;/)?.[0] ?? "";

  it("locks the post row before deciding a transition", () => {
    expect(fnBody).toMatch(/select \* into v_post from public\.posts where id = p_post_id for update;/);
  });

  it("denies a non-active account outright", () => {
    expect(fnBody).toMatch(/not found or v_actor\.status <> 'active'/);
  });

  it("requires chapter-master authorship and matching county", () => {
    expect(fnBody).toMatch(/v_post\.author_user_id is distinct from v_uid/);
    expect(fnBody).toMatch(/v_post\.county_id is distinct from v_actor\.county_id/);
  });

  it("never allows a chapter master to start from 'pending' — only an admin can move pending to approved", () => {
    const chapterBranch = fnBody.match(/elsif v_actor\.role = 'chapter_master' then([\s\S]*?)v_target_status := case/)?.[1] ?? "";
    expect(chapterBranch).toMatch(/if v_previous_status not in \('draft', 'rejected'\) then/);
    expect(chapterBranch).not.toContain("'pending'");
  });

  it("admin may act on a pending post (approve it) in addition to draft/rejected", () => {
    const adminBranch = fnBody.match(/if v_actor\.role = 'admin' then([\s\S]*?)v_target_status := 'approved';/)?.[1] ?? "";
    expect(adminBranch).toMatch(/'draft', 'pending', 'rejected'/);
  });

  it("uses only the live posts_status_check vocabulary — no invented 'returned'/'revision_requested' status anywhere in the function", () => {
    expect(fnBody).not.toContain("returned");
    expect(fnBody).not.toContain("revision_requested");
  });

  it("routes trusted (review_required = false) to approved and restricted to pending", () => {
    expect(fnBody).toMatch(/v_target_status := case when v_actor\.review_required then 'pending' else 'approved' end;/);
  });

  it("sets/clears approved_at, approved_by, submitted_at, and rejected_at consistently on every successful transition", () => {
    expect(fnBody).toMatch(/submitted_at = now\(\),/);
    expect(fnBody).toMatch(/approved_at = case when v_target_status = 'approved' then now\(\) else null end,/);
    expect(fnBody).toMatch(/approved_by = case when v_target_status = 'approved' then v_uid else null end,/);
    expect(fnBody).toMatch(/rejected_at = null/);
  });

  it("audits with only previous_status/new_status in event_data — no title or body", () => {
    const eventData = fnBody.match(/jsonb_build_object\('previous_status', v_previous_status, 'new_status', v_target_status\)/);
    expect(eventData).not.toBeNull();
    expect(fnBody).not.toMatch(/v_post\.title/);
    expect(fnBody).not.toMatch(/v_post\.body/);
  });
});

describe("chapter accounts migration: live posts_status_check preflight", () => {
  it("asserts the deployed constraint's actual definition rather than trusting an invented status vocabulary", () => {
    expect(migrationSql).toMatch(/select pg_get_constraintdef\(oid\) into v_condef/);
    expect(migrationSql).toMatch(/conname = 'posts_status_check' and conrelid = 'public\.posts'::regclass/);
  });

  it("fails loudly if the constraint is missing or doesn't match draft/pending/approved/rejected", () => {
    expect(migrationSql).toMatch(/posts_status_check does not match the expected live status set/);
  });

  it("fails loudly if the constraint still permits the invented 'returned'\\/'revision_requested' statuses", () => {
    expect(migrationSql).toMatch(/v_condef like '%returned%' or v_condef like '%revision_requested%'/);
  });
});

describe("chapter accounts migration: SECURITY DEFINER hardening and grants", () => {
  const functionSignatures = [
    "public.rrg_admin_list_chapter_accounts(text, bigint, text, text, text, integer, integer)",
    "public.rrg_get_my_forwarding_email()",
    "public.rrg_set_my_forwarding_email(text)",
    "public.rrg_admin_set_forwarding_email(uuid, text)",
    "public.rrg_admin_set_review_required(uuid, boolean)",
    "public.rrg_admin_set_account_status(uuid, text)",
    "public.rrg_submit_post(bigint)",
  ];

  it("every new function sets an empty search_path", () => {
    const occurrences = [...migrationSql.matchAll(/set search_path = ''/g)].length;
    expect(occurrences).toBeGreaterThanOrEqual(functionSignatures.length);
  });

  it("revokes from public/anon and grants only to authenticated for every new function", () => {
    for (const signature of functionSignatures) {
      expect(migrationSql).toContain(signature);
    }
    expect(migrationSql).toMatch(/revoke all on function %s from public;/);
    expect(migrationSql).toMatch(/revoke all on function %s from anon;/);
    expect(migrationSql).toMatch(/grant execute on function %s to authenticated;/);
    expect(migrationSql).not.toMatch(/grant execute on function [^;]*to (public|anon)\b/i);
  });
});

describe("chapter accounts migration: does not touch existing RLS", () => {
  it("never alters portal_accounts or posts RLS", () => {
    expect(migrationSql).not.toMatch(/alter table public\.portal_accounts (enable|disable|force|no force) row level security/i);
    expect(migrationSql).not.toMatch(/alter table public\.posts (enable|disable|force|no force) row level security/i);
    expect(migrationSql).not.toMatch(/create policy/i);
  });

  it("wraps writes in a single transaction and checks required foundation objects first", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
    expect(migrationSql).toMatch(/if to_regclass\('public\.posts'\) is null then/);
  });
});
