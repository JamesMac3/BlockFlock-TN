import test from "node:test";
import assert from "node:assert/strict";
import { canManageProfileEntity } from "../src/features/portal-admin/profileAuthority.js";

const rutherfordEntity = { id: 5, county_id: 1, legal_name: "Murfreesboro Police Department" };
const davidsonEntity = { id: 9, county_id: 2, legal_name: "Nashville Metro Police Department" };

test("an admin may manage request profiles for any county's entity", () => {
  const admin = { role: "admin", status: "active", county_id: null };
  assert.equal(canManageProfileEntity({ account: admin, entity: rutherfordEntity }), true);
  assert.equal(canManageProfileEntity({ account: admin, entity: davidsonEntity }), true);
});

test("an active chapter master may manage their own assigned county's entity", () => {
  const chapterMaster = { role: "chapter_master", status: "active", county_id: 1 };
  assert.equal(canManageProfileEntity({ account: chapterMaster, entity: rutherfordEntity }), true);
});

test("cross-county rejection: a chapter master may never manage another county's entity", () => {
  const chapterMaster = { role: "chapter_master", status: "active", county_id: 1 };
  assert.equal(canManageProfileEntity({ account: chapterMaster, entity: davidsonEntity }), false);
});

test("suspended-account rejection: a suspended account is denied regardless of role or county", () => {
  const suspendedAdmin = { role: "admin", status: "suspended", county_id: null };
  const suspendedChapterMaster = { role: "chapter_master", status: "suspended", county_id: 1 };
  assert.equal(canManageProfileEntity({ account: suspendedAdmin, entity: rutherfordEntity }), false);
  assert.equal(canManageProfileEntity({ account: suspendedChapterMaster, entity: rutherfordEntity }), false);
});

test("restricted post-review status (review_required) never restricts profile authority — it is not even read", () => {
  const restrictedButActiveChapterMaster = { role: "chapter_master", status: "active", county_id: 1, review_required: true };
  assert.equal(canManageProfileEntity({ account: restrictedButActiveChapterMaster, entity: rutherfordEntity }), true);
});

test("no account, or an unknown entity, is denied rather than throwing", () => {
  assert.equal(canManageProfileEntity({ account: null, entity: rutherfordEntity }), false);
  const admin = { role: "admin", status: "active", county_id: null };
  assert.equal(canManageProfileEntity({ account: admin, entity: null }), false);
});
