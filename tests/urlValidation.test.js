import test from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeUrl, validateExternalUrl } from "../src/utils/urlValidation.js";

test("accepts a normal HTTPS link", () => {
  const result = validateExternalUrl("https://example.org/records");
  assert.equal(result.valid, true);
  assert.equal(result.hostname, "example.org");
});

test("rejects dangerous protocols and private destinations", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.org",
    "https://localhost/test",
    "https://127.0.0.1/test",
    "https://192.168.1.20/test",
  ]) {
    assert.equal(validateExternalUrl(value).valid, false, value);
  }
});

test("parses supported YouTube URL forms", () => {
  for (const value of [
    "https://www.youtube.com/watch?v=AbCdEf12345",
    "https://youtu.be/AbCdEf12345",
    "https://www.youtube.com/shorts/AbCdEf12345",
  ]) {
    assert.equal(parseYouTubeUrl(value).videoId, "AbCdEf12345");
  }
});

test("rejects YouTube lookalikes and invalid IDs", () => {
  assert.equal(parseYouTubeUrl("https://youtube.example.com/watch?v=AbCdEf12345").valid, false);
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=x").valid, false);
});
