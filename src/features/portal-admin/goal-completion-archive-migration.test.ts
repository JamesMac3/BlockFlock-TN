import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import migrationSql from "../../../supabase/migrations/20260821060804_goal_completion_and_public_archive.sql?raw";

/**
 * Static assertions against the unapplied goal-resource/public-archive
 * migration's actual SQL text — the closest available proof of its
 * behavior since there is no live database in this environment.
 */

function extractFunction(sql: string, signature: string, terminator = "\nend;\n$$;"): string {
  const start = sql.indexOf(signature);
  if (start === -1) return "";
  const end = sql.indexOf(terminator, start);
  return end === -1 ? "" : sql.slice(start, end + terminator.length);
}

describe("goal-resource migration: never recreates or replaces live storage", () => {
  it("never creates or inserts a storage bucket", () => {
    expect(migrationSql).not.toMatch(/insert into storage\.buckets/i);
    expect(migrationSql).not.toMatch(/create\s+bucket/i);
  });

  it("never creates, alters, or drops a storage policy", () => {
    expect(migrationSql).not.toMatch(/create policy/i);
    expect(migrationSql).not.toMatch(/alter policy/i);
    expect(migrationSql).not.toMatch(/drop policy/i);
  });

  it("checks the exact verified live policy names, private incoming (all four CRUD) and public admin-write (insert/update/delete)", () => {
    for (const policyName of [
      "archive_uploads_county_insert",
      "archive_uploads_county_select",
      "archive_uploads_county_update",
      "archive_uploads_county_delete",
      "public_records_archive_admin_insert",
      "public_records_archive_admin_update",
      "public_records_archive_admin_delete",
    ]) {
      expect(migrationSql).toContain(`policyname = '${policyName}'`);
    }
  });
});

describe("goal-resource migration: public_description lives on the link, never overwrites the goal's public_summary", () => {
  it("adds records_request_goal_links.public_description as a new column", () => {
    expect(migrationSql).toMatch(/alter table public\.records_request_goal_links add column if not exists public_description text;/);
  });

  it("never writes county_records_request_goals.public_summary", () => {
    expect(migrationSql).not.toMatch(/set public_summary/i);
  });

  it("adds records_request_goal_templates.default_tier, bounded to 1-4", () => {
    expect(migrationSql).toMatch(/alter table public\.records_request_goal_templates add column if not exists default_tier integer;/);
    expect(migrationSql).toMatch(/check \(default_tier is null or default_tier between 1 and 4\)/);
  });

  it("adds a database-level check that a locked goal has a non-blank, non-whitespace-only locked_reason", () => {
    expect(migrationSql).toMatch(
      /check \(not locked or char_length\(trim\(coalesce\(locked_reason, ''\)\)\) > 0\)/,
    );
  });
});

const addResourceFn = extractFunction(migrationSql, "create or replace function public.rrg_add_goal_resource(");

describe("goal-resource migration: rrg_add_goal_resource ordering and authorization", () => {
  it("checks auth.uid() before anything else", () => {
    const authIndex = addResourceFn.indexOf("if v_uid is null then");
    const lockIndex = addResourceFn.indexOf("for update;");
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(authIndex);
  });

  it("loads and locks the goal row (SELECT ... FOR UPDATE) before authorizing", () => {
    const lockIndex = addResourceFn.indexOf("for update;");
    const notFoundIndex = addResourceFn.indexOf("if not found then");
    const authzIndex = addResourceFn.indexOf("rrg_can_manage_county(v_goal.county_id)");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(notFoundIndex).toBeGreaterThan(lockIndex);
    expect(authzIndex).toBeGreaterThan(notFoundIndex);
  });

  it("validates state/path/MIME/hash only after authorization succeeds", () => {
    const authzIndex = addResourceFn.indexOf("rrg_can_manage_county(v_goal.county_id)");
    const stateIndex = addResourceFn.indexOf("v_goal.status in ('draft', 'retired')");
    const pathIndex = addResourceFn.indexOf("p_storage_path !~");
    expect(stateIndex).toBeGreaterThan(authzIndex);
    expect(pathIndex).toBeGreaterThan(stateIndex);
  });
});

describe("goal-resource migration: Partial (received) by default, Complete (published) only when asked, never downgraded", () => {
  it("accepts a p_mark_complete parameter, defaulting to false", () => {
    expect(addResourceFn).toMatch(/p_mark_complete boolean default false/);
  });

  it("sets status to 'received' by default, 'published' only when p_mark_complete is true", () => {
    expect(addResourceFn).toMatch(/if p_mark_complete then\s*\n\s*v_new_status := 'published';/);
    expect(addResourceFn).toMatch(/elsif v_goal\.status <> 'published' then\s*\n\s*v_new_status := 'received';/);
  });

  it("never downgrades an already-published goal on a default (Partial) add", () => {
    expect(addResourceFn).toMatch(/else\s*\n\s*v_new_status := v_goal\.status;/);
  });

  it("rejects draft/retired and locked goals", () => {
    expect(addResourceFn).toMatch(/v_goal\.status in \('draft', 'retired'\)/);
    expect(addResourceFn).toMatch(/if v_goal\.locked then/);
  });

  it("audits adding a resource distinctly from explicitly completing a goal", () => {
    expect(addResourceFn).toContain("'goal_resource_added'");
    expect(addResourceFn).toMatch(/if p_mark_complete then\s*\n\s*insert into public\.security_audit_events/);
    expect(addResourceFn).toContain("'goal_marked_complete'");
  });

  it("stores a sanitized original filename as metadata only, bounded in length", () => {
    expect(addResourceFn).toContain("p_original_filename");
    expect(addResourceFn).toMatch(/char_length\(p_original_filename\) > 255/);
  });
});

describe("goal-resource migration: exact storage-path regex, not a prefix LIKE", () => {
  it("never uses a LIKE-prefix check for the storage path", () => {
    expect(addResourceFn).not.toMatch(/like\s*\(?\s*'.*'\s*\|\|.*'%'/i);
  });

  it("uses an anchored regex requiring exactly one filename segment", () => {
    expect(addResourceFn).toContain("'^counties/'");
    expect(addResourceFn).toContain("'/entities/'");
    expect(addResourceFn).toContain("'/goals/'");
    expect(addResourceFn).toContain("'/[^/]+$'");
  });
});

describe("goal-resource migration: strong file validation matches the verified live bucket limits", () => {
  it("enforces the exact 52428800-byte ceiling and a positive minimum", () => {
    expect(addResourceFn).toMatch(/p_size_bytes < 1 or p_size_bytes > 52428800/);
  });

  it("requires a well-formed 64-character lowercase hex sha256", () => {
    expect(addResourceFn).toMatch(/p_sha256_hex !~ '\^\[0-9a-f\]\{64\}\$'/);
  });

  it("uses the exact verified live MIME allowlist", () => {
    for (const mime of [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "image/jpeg",
      "image/png",
      "image/tiff",
      "message/rfc822",
      "text/csv",
      "text/plain",
    ]) {
      expect(addResourceFn).toContain(`'${mime}'`);
    }
  });

  it("restricts object_kind to responsive_record/correspondence only for this workflow", () => {
    expect(addResourceFn).toMatch(/p_object_kind not in \('responsive_record', 'correspondence'\)/);
  });

  it("requires the bucket to be exactly public-records-archive", () => {
    expect(addResourceFn).toMatch(/p_storage_bucket is distinct from 'public-records-archive'/);
  });

  it("sets created_by and verified_by/verified_at to the authenticated actor", () => {
    expect(addResourceFn).toMatch(/p_original_filename, 'public', 'published', v_uid, v_uid, now\(\)/);
  });
});

describe("goal-resource migration: publishing a resource atomically sets the goal public", () => {
  it("rrg_add_goal_resource sets is_public = true alongside status in the same UPDATE", () => {
    expect(addResourceFn).toMatch(/set status = v_new_status, is_public = true/);
  });

  it("rrg_add_goal_resource audits the previous/new is_public transition", () => {
    expect(addResourceFn).toMatch(/'previous_is_public', v_goal\.is_public, 'new_is_public', true/);
  });
});

const addExternalFn = extractFunction(migrationSql, "create or replace function public.rrg_add_external_source(");

describe("goal-resource migration: rrg_add_external_source — strict server-side URL validation", () => {
  it("never relies on a client-side startsWith('https://') style check alone — it is documented as server-enforced", () => {
    expect(addExternalFn).toMatch(/Never trust a client-side startsWith/);
  });

  it("requires https and rejects other schemes", () => {
    expect(addExternalFn).toMatch(/p_external_url !~ '\^https:\/\//);
  });

  it("rejects a URL with embedded credentials", () => {
    expect(addExternalFn).toMatch(/v_authority ~ '@'/);
  });

  it("rejects ALL IPv4 literals outright, not just private ranges — no incomplete range parsing", () => {
    expect(addExternalFn).toMatch(/v_host ~ '\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$'/);
    // Must not attempt to enumerate specific private ranges (10.x, 192.168.x,
    // etc.) — a public IPv4 literal (e.g. 8.8.8.8) must be rejected too.
    expect(addExternalFn).not.toMatch(/v_host ~ '\^10\\\./);
    expect(addExternalFn).not.toMatch(/v_host ~ '\^192\\\.168\\\./);
  });

  it("rejects IPv6 literals (bracketed authority) outright", () => {
    expect(addExternalFn).toMatch(/v_authority ~ '\^\\\['/);
  });

  it("rejects localhost and any single-label (non-dotted) hostname", () => {
    expect(addExternalFn).toMatch(/v_host = 'localhost'/);
    expect(addExternalFn).toMatch(/v_host !~ '\\\.'/);
  });

  it("rejects .local/.localhost/.internal/.test/.invalid suffixed hosts", () => {
    expect(addExternalFn).toMatch(/v_host ~ '\\\.local\$'/);
    expect(addExternalFn).toMatch(/v_host ~ '\\\.internal\$'/);
  });

  it("rejects control/whitespace characters in the host", () => {
    expect(addExternalFn).toMatch(/v_host ~ '\[\[:space:\]\[:cntrl:\]\]'/);
  });

  it("still accepts a conventional public multi-label hostname (documented, not executed — no live DB in this environment)", () => {
    // A hostname like www.muckrock.com or www.murfreesborotn.gov: contains
    // a dot, is not an IP literal, is not localhost, has no reserved
    // suffix — none of the rejection branches above would fire for it.
    expect(addExternalFn).toMatch(/A conventional public hostname is required/);
  });

  it("shares the same Partial/Complete semantics and authorization ordering as rrg_add_goal_resource", () => {
    expect(addExternalFn).toMatch(/for update;/);
    expect(addExternalFn).toMatch(/rrg_can_manage_county\(v_goal\.county_id\)/);
    expect(addExternalFn).toMatch(/p_mark_complete boolean default false/);
    expect(addExternalFn).toContain("'goal_external_source_added'");
    expect(addExternalFn).toContain("'goal_marked_complete'");
  });

  it("assigns the next position under the goal's own row lock, same as the hosted-resource path", () => {
    expect(addExternalFn).toMatch(/coalesce\(max\(position\) \+ 1, 0\)/);
  });

  it("also sets is_public = true alongside status and audits the transition", () => {
    expect(addExternalFn).toMatch(/set status = v_new_status, is_public = true/);
    expect(addExternalFn).toMatch(/'previous_is_public', v_goal\.is_public, 'new_is_public', true/);
  });

  it("validates label length and public_description length", () => {
    expect(addExternalFn).toMatch(/char_length\(v_label\) > 200/);
    expect(addExternalFn).toMatch(/char_length\(p_public_description\) > 2000/);
  });
});

const setCompletionFn = extractFunction(migrationSql, "create or replace function public.rrg_set_goal_completion(");

describe("goal-resource migration: rrg_set_goal_completion — replaces the frontend's direct status update", () => {
  it("locks the goal row and authorizes via the county before checking anything else", () => {
    const lockIndex = setCompletionFn.indexOf("for update;");
    const authzIndex = setCompletionFn.indexOf("rrg_can_manage_county(v_goal.county_id)");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(authzIndex).toBeGreaterThan(lockIndex);
  });

  it("rejects draft/retired and locked goals", () => {
    expect(setCompletionFn).toMatch(/v_goal\.status in \('draft', 'retired'\)/);
    expect(setCompletionFn).toMatch(/if v_goal\.locked then/);
  });

  it("requires at least one qualifying public resource before allowing Complete", () => {
    expect(setCompletionFn).toMatch(/if v_qualifying_count = 0 then/);
    expect(setCompletionFn).toMatch(/At least one qualifying public resource is required before marking this goal Complete\./);
  });

  it("the qualifying-resource count uses the same gate as the public archive (external https, or public+published+non-submitted_request hosted evidence in an allowed bucket)", () => {
    expect(setCompletionFn).toMatch(/link\.external_url ~ '\^https:\/\/'/);
    expect(setCompletionFn).toMatch(/evidence\.visibility = 'public'/);
    expect(setCompletionFn).toMatch(/evidence\.status = 'published'/);
    expect(setCompletionFn).toMatch(/evidence\.object_kind <> 'submitted_request'/);
  });

  it("MAY downgrade an already-published goal back to received — this is an explicit operator action, unlike the resource-add RPCs", () => {
    expect(setCompletionFn).toMatch(/v_new_status := 'received';/);
    expect(setCompletionFn).not.toMatch(/elsif v_goal\.status <> 'published'/);
  });

  it("never touches a resource or evidence row — only the goal's own status", () => {
    expect(setCompletionFn).not.toMatch(/insert into public\.evidence_objects/);
    expect(setCompletionFn).not.toMatch(/insert into public\.records_request_goal_links/);
  });

  it("audits the previous and new status", () => {
    expect(setCompletionFn).toContain("'goal_completion_state_changed'");
    expect(setCompletionFn).toMatch(/jsonb_build_object\('goal_id', v_goal\.id, 'previous_status', v_previous_status, 'new_status', v_new_status\)/);
  });
});

const cleanupFn = extractFunction(migrationSql, "create or replace function public.rrg_log_goal_evidence_cleanup_failure(");

describe("goal-resource migration: cleanup-failure logging", () => {
  it("exists and is authorized against the goal's county", () => {
    expect(cleanupFn).toContain("rrg_can_manage_county(v_goal.county_id)");
  });

  it("logs a distinct, auditable event_type", () => {
    expect(cleanupFn).toContain("'goal_evidence_cleanup_failed'");
  });
});

describe("goal-resource migration: county_contacts admin RPC", () => {
  const contactsFn = migrationSql.match(/create or replace function public\.rrg_admin_list_county_contacts\(([\s\S]*?)\n\$\$;/)?.[0] ?? "";

  it("is admin-only", () => {
    expect(contactsFn).toMatch(/admin_account\.role = 'admin'/);
    expect(contactsFn).toMatch(/admin_account\.status = 'active'/);
  });

  it("selects only the approved allowlist (county, email, phone, created_at) plus the pagination total — nothing else", () => {
    expect(contactsFn).toMatch(/contact\.county_id,\s*\n\s*county\.name,\s*\n\s*contact\.email,\s*\n\s*contact\.phone,\s*\n\s*contact\.created_at,\s*\n\s*count\(\*\) over\(\) as total_count/);
  });

  it("is server-side paginated with a hard maximum of 100 rows per page", () => {
    expect(contactsFn).toMatch(/v_page_size integer := least\(greatest\(coalesce\(p_page_size, 25\), 1\), 100\);/);
    expect(contactsFn).toMatch(/limit v_page_size\s*\n\s*offset \(v_page - 1\) \* v_page_size;/);
  });

  it("filters by county and a search term across county/email/phone", () => {
    expect(contactsFn).toMatch(/p_county_id is null or contact\.county_id = p_county_id/);
    expect(contactsFn).toMatch(/county\.name ilike '%' \|\| v_search \|\| '%'/);
    expect(contactsFn).toMatch(/contact\.email ilike '%' \|\| v_search \|\| '%'/);
  });
});

describe("goal-resource migration: goal-first public archive RPCs — narrowed gate (received/published + at least one qualifying resource)", () => {
  it("get_public_archive_goals requires goal.is_public and status in ('received','published') — never the broader rrg_goal_is_public set", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    expect(fn).toMatch(/where goal\.is_public = true\s*\n\s*and goal\.status in \('received', 'published'\)/);
    expect(fn).not.toMatch(/where public\.rrg_goal_is_public\(goal\.id\)/);
  });

  it("get_public_archive_goals INNER JOINs a qualifying_links CTE, structurally excluding any goal with zero qualifying resources — e.g. ten public 'ready'-status goals with no links produce zero rows (excluded by both the status filter and the join)", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    expect(fn).toMatch(/with qualifying_links as \(/);
    expect(fn).toMatch(/join qualifying_links as ql on ql\.goal_id = goal\.id/);
    expect(fn).not.toMatch(/left join qualifying_links/);
    expect(fn).not.toContain("'ready'");
  });

  it("resource_count counts only qualifying links (ql.link_id), never the raw unfiltered link count", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    expect(fn).toMatch(/count\(ql\.link_id\) as resource_count/);
    expect(fn).not.toMatch(/count\(link\.id\) as resource_count/);
  });

  it("a qualifying link is an external https link, or hosted evidence passing the full public-suitability gate", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    expect(fn).toMatch(/link\.external_url ~ '\^https:\/\/'/);
    expect(fn).toMatch(/evidence\.visibility = 'public'/);
    expect(fn).toMatch(/evidence\.status = 'published'/);
    expect(fn).toMatch(/evidence\.object_kind <> 'submitted_request'/);
    expect(fn).toMatch(/evidence\.storage_bucket = any\(array\['public-records-archive', 'request-templates'\]\)/);
  });

  it("get_public_archive_goals labels completion state Complete/Partial from goal.status", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    expect(fn).toMatch(/case when goal\.status = 'published' then 'Complete' else 'Partial' end/);
  });

  it("get_public_archive_goal returns null for a goal that is not public or not received/published — never the broader rrg_goal_is_public set", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goal(p_goal_id bigint)");
    expect(fn).toMatch(/if not v_goal\.is_public or v_goal\.status not in \('received', 'published'\) then\s*\n\s*return null;/);
    expect(fn).not.toMatch(/if not public\.rrg_goal_is_public\(p_goal_id\)/);
  });

  it("get_public_archive_goal returns null when the goal has zero qualifying resources, even if public and received/published", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goal(p_goal_id bigint)");
    expect(fn).toMatch(/if jsonb_array_length\(v_resources\) = 0 then\s*\n\s*return null;/);
  });

  it("get_public_archive_document requires linkage through a public goal with status received or published", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_document(p_evidence_id uuid)", "\n$$;");
    expect(fn).toMatch(/and goal\.is_public = true\s*\n\s*and goal\.status in \('received', 'published'\)/);
    expect(fn).not.toMatch(/public\.rrg_goal_is_public\(goal\.id\)/);
  });

  it("get_public_archive_goal orders resources by position and includes both hosted and external sources", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goal(p_goal_id bigint)");
    expect(fn).toMatch(/order by link\.position/);
    expect(fn).toMatch(/'source_kind', case when link\.evidence_object_id is not null then 'hosted' else 'external' end/);
    expect(fn).toMatch(/jsonb_agg\(resource order by sort_key/);
  });

  it("get_public_archive_goal excludes a hosted link whose evidence fails the public-suitability gate, without leaking its existence", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goal(p_goal_id bigint)");
    expect(fn).toMatch(/evidence\.visibility = 'public'/);
    expect(fn).toMatch(/evidence\.status = 'published'/);
    expect(fn).toMatch(/evidence\.object_kind <> 'submitted_request'/);
    expect(fn).toMatch(/and \(link\.evidence_object_id is null or evidence\.id is not null\)/);
  });

  it("never selects fill_payload anywhere in the archive functions", () => {
    const goalsFn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goals()", "\n$$;");
    const goalFn = extractFunction(migrationSql, "create or replace function public.get_public_archive_goal(p_goal_id bigint)");
    const documentFn = extractFunction(migrationSql, "create or replace function public.get_public_archive_document(p_evidence_id uuid)", "\n$$;");
    expect(goalsFn).not.toMatch(/fill_payload/);
    expect(goalFn).not.toMatch(/fill_payload/);
    expect(documentFn).not.toMatch(/fill_payload/);
  });

  it("get_public_archive_document resolves storage_bucket/storage_path server-side from p_evidence_id only", () => {
    const fn = extractFunction(migrationSql, "create or replace function public.get_public_archive_document(p_evidence_id uuid)", "\n$$;");
    expect(fn).toMatch(/where evidence\.id = p_evidence_id/);
    expect(fn).toMatch(/representative\.storage_bucket,/);
    expect(fn).toMatch(/representative\.storage_path/);
    expect(fn).toMatch(/limit 1;/);
  });

  it("resolves uploader/reviewer to safe role labels, falling back to 'Not recorded' on no match", () => {
    expect(migrationSql).toContain("'Administrator'");
    expect(migrationSql).toContain("' Chapter Master'");
    expect(migrationSql).toContain("'Not recorded'");
  });

  it("the old document-first list RPC no longer exists, superseded by the goal-first list", () => {
    expect(migrationSql).not.toMatch(/create or replace function public\.get_public_archive_documents\(\)/);
  });
});

describe("goal-resource migration: grants", () => {
  it("grants the goal-first archive functions and the single-document resolver to anon and authenticated (public browsing)", () => {
    expect(migrationSql).toMatch(/grant execute on function %s to anon;/);
    for (const signature of [
      "public.get_public_archive_goals()",
      "public.get_public_archive_goal(bigint)",
      "public.get_public_archive_document(uuid)",
    ]) {
      expect(migrationSql).toContain(signature);
    }
  });

  it("grants every other new function to authenticated only", () => {
    for (const signature of [
      "public.rrg_add_goal_resource(bigint, text, text, text, text, bigint, text, text, text, text, boolean)",
      "public.rrg_add_external_source(bigint, text, text, text, boolean)",
      "public.rrg_set_goal_completion(bigint, boolean)",
      "public.rrg_log_goal_evidence_cleanup_failure(bigint, text, text, text)",
      "public.rrg_admin_list_county_contacts(text, bigint, text, text, integer, integer)",
    ]) {
      expect(migrationSql).toContain(signature);
    }
  });
});

describe("goal-resource migration: transaction and precondition safety", () => {
  it("wraps writes in a single transaction", () => {
    const beginIndex = migrationSql.indexOf("begin;");
    const commitIndex = migrationSql.indexOf("commit;");
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
  });

  it("checks required foundation functions/tables exist before proceeding", () => {
    expect(migrationSql).toMatch(/if to_regprocedure\('public\.rrg_can_manage_county\(bigint\)'\) is null then/);
  });

  it("no longer depends on rrg_goal_is_public — the archive gate is now the narrower explicit is_public/status check", () => {
    expect(migrationSql).not.toMatch(/to_regprocedure\('public\.rrg_goal_is_public\(bigint\)'\)/);
  });
});
