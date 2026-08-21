import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDraftPostPayload,
  runWithVerifiedUser,
} from "../src/utils/postPayload.js";

const ADMIN = { id: "admin-auth-user" };
const BASE_FORM = {
  title: "Public update",
  scope: "global",
  countyId: "",
  contentType: "announcement",
  summary: "Summary",
  body: "Body",
  bodyRich: { type: "doc", content: [] },
  eventStart: "",
  eventLocation: "",
  eventAddress: "",
  isPinned: false,
};

function draft(overrides = {}, options = {}) {
  return buildDraftPostPayload({
    form: { ...BASE_FORM, ...overrides },
    meetingOnly: false,
    authenticatedUser: ADMIN,
    existingPost: null,
    ...options,
  });
}

test("new admin draft includes author_user_id and clean review fields", () => {
  const payload = draft();
  assert.equal(payload.author_user_id, ADMIN.id);
  assert.equal(payload.status, "draft");
  assert.equal(payload.approved_at, null);
  assert.equal(payload.approved_by, null);
  assert.equal(payload.rejected_at, null);
});

test("statewide post includes authenticated author and no county", () => {
  const payload = draft({ scope: "global", countyId: "42" });
  assert.equal(payload.author_user_id, ADMIN.id);
  assert.equal(payload.scope, "global");
  assert.equal(payload.county_id, null);
});

test("county post includes authenticated author and selected county", () => {
  const payload = draft({ scope: "county", countyId: "42" });
  assert.equal(payload.author_user_id, ADMIN.id);
  assert.equal(payload.scope, "county");
  assert.equal(payload.county_id, 42);
});

test("meeting-only listing includes authenticated author", () => {
  const payload = buildDraftPostPayload({
    form: { ...BASE_FORM, summary: "", contentType: "meeting" },
    meetingOnly: true,
    authenticatedUser: ADMIN,
    existingPost: null,
  });
  assert.equal(payload.author_user_id, ADMIN.id);
  assert.equal(payload.content_type, "meeting");
  assert.equal(payload.body, "Meeting details and schedule.");
});

test("missing authenticated user prevents insertion", async () => {
  let insertCalls = 0;
  await assert.rejects(
    runWithVerifiedUser({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      expectedUser: null,
      operation: async () => { insertCalls += 1; },
    }),
    /session could not be verified/i
  );
  assert.equal(insertCalls, 0);
});

test("missing authenticated user prevents media upload", async () => {
  let uploadCalls = 0;
  await assert.rejects(
    runWithVerifiedUser({
      auth: { getUser: async () => ({ data: { user: null }, error: new Error("expired") }) },
      expectedUser: ADMIN,
      operation: async () => { uploadCalls += 1; },
    }),
    /session could not be verified/i
  );
  assert.equal(uploadCalls, 0);
});

test("editing a chapter-authored post preserves its original author", () => {
  const payload = buildDraftPostPayload({
    form: BASE_FORM,
    meetingOnly: false,
    authenticatedUser: ADMIN,
    existingPost: { id: 9, author_user_id: "chapter-master-auth-user" },
  });
  assert.equal(payload.author_user_id, "chapter-master-auth-user");
  assert.notEqual(payload.author_user_id, ADMIN.id);
});
