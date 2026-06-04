/**
 * R2 credentials validation test.
 * Uploads a tiny text file to the configured R2 bucket and verifies
 * the returned URL is accessible, confirming credentials are correct.
 */
import { describe, it, expect } from "vitest";
import { storagePut } from "./storage";

describe("Cloudflare R2 credentials", () => {
  it("should upload a test file to R2 and return a public URL", async () => {
    const testKey = `_test/credential-check-${Date.now()}.txt`;
    const result = await storagePut(testKey, "R2 credential check OK", "text/plain");

    expect(result.key).toBeTruthy();
    expect(result.url).toMatch(/^https?:\/\//);

    // Verify the file is publicly accessible
    const res = await fetch(result.url);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe("R2 credential check OK");
  }, 30000); // 30s timeout for network round-trip
});
