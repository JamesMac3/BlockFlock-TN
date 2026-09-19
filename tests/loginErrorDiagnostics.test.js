import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySignInError,
  describeSignInError,
  GENERIC_CREDENTIALS_MESSAGE,
  SIGN_IN_ERROR_MESSAGES,
} from "../src/features/portal-admin/loginErrorDiagnostics.js";

test("no error classifies as credentials (the safe default)", () => {
  assert.equal(classifySignInError(null), "credentials");
  assert.equal(classifySignInError(undefined), "credentials");
});

test("invalid_credentials (wrong password or nonexistent account — Supabase itself never distinguishes them) stays generic", () => {
  const error = { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" };
  assert.equal(classifySignInError(error), "credentials");
  assert.equal(describeSignInError(error), GENERIC_CREDENTIALS_MESSAGE);
});

test("a captcha_failed code classifies as captcha, never as credentials", () => {
  const error = { name: "AuthApiError", status: 400, code: "captcha_failed", message: "captcha protection: request disallowed" };
  assert.equal(classifySignInError(error), "captcha");
  assert.notEqual(describeSignInError(error), GENERIC_CREDENTIALS_MESSAGE);
});

test("AuthRetryableFetchError (request never reached the server) classifies as connection", () => {
  const error = { name: "AuthRetryableFetchError", status: undefined, message: "Failed to fetch" };
  assert.equal(classifySignInError(error), "connection");
});

test("any AuthError with no HTTP status at all classifies as connection, per auth-js's own documented behavior for pre-response failures", () => {
  const error = { name: "AuthUnknownError", status: undefined, message: "Network request failed" };
  assert.equal(classifySignInError(error), "connection");
});

test("a 5xx response classifies as service, distinct from credentials and connection", () => {
  const error = { name: "AuthApiError", status: 503, code: "unexpected_failure", message: "Service Unavailable" };
  assert.equal(classifySignInError(error), "service");
});

test("a 500 response classifies as service", () => {
  assert.equal(classifySignInError({ status: 500 }), "service");
});

test("a 4xx response other than the known captcha code stays credentials, never leaking which check failed", () => {
  assert.equal(classifySignInError({ status: 422, code: "email_address_invalid" }), "credentials");
  assert.equal(classifySignInError({ status: 429, code: "over_request_rate_limit" }), "credentials");
});

test("every non-credentials message is distinct from the generic credentials message and from each other", () => {
  const messages = Object.values(SIGN_IN_ERROR_MESSAGES);
  assert.equal(new Set(messages).size, messages.length);
});

test("no message text ever echoes a raw backend error message", () => {
  const rawBackendMessage = "duplicate key value violates unique constraint \"users_email_key\"";
  for (const message of Object.values(SIGN_IN_ERROR_MESSAGES)) {
    assert.notEqual(message, rawBackendMessage);
    assert.doesNotMatch(message, /constraint|duplicate key|relation/i);
  }
});
