import test from "node:test";
import assert from "node:assert/strict";
import { freeOnlyConfiguration } from "../server/cost-policy.mjs";

test("free-only default cannot activate paid AI just because a key is present", () => {
  assert.deepEqual(freeOnlyConfiguration({}), { ai: "demo", storage: "local" });
  assert.deepEqual(freeOnlyConfiguration({ OPENAI_API_KEY: "test-key" }), {
    ai: "demo",
    storage: "local",
  });
});
test("free-only startup rejects billable provider configuration before using it", () => {
  assert.throws(
    () => freeOnlyConfiguration({ AI_PROVIDER: "openai" }),
    /paid AI is disabled/,
  );
  assert.throws(
    () => freeOnlyConfiguration({ S3_BUCKET: "some-bucket" }),
    /external S3 storage is disabled/,
  );
});
