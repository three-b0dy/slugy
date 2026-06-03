import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFindFirst = mock(async () => ({ userId: "user-owner-1" }));
const mockCheckRateLimit = mock(async () => ({
  success: true,
  limit: 80,
  reset: Date.now() + 60_000,
  remaining: 79,
}));
const mockHashKey = mock((input: string) => `hash-${input}`);

mock.module("@/server/db", () => ({
  db: { workspace: { findFirst: mockFindFirst } },
}));
mock.module("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));
mock.module("@/lib/redis", () => ({
  hashKey: mockHashKey,
}));

// ── Import after mocks are set up ────────────────────────────────────────────
const { resolveApiKeyAuth } = await import("../auth-api-key");

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_KEY = "test-api-key-abc123";
const OTHER_KEY = "wrong-key-xyz789";

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/test", {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("resolveApiKeyAuth", () => {
  beforeEach(() => {
    mockFindFirst.mockClear();
    mockCheckRateLimit.mockClear();
    mockHashKey.mockClear();
    process.env.SLUGY_API_KEY = VALID_KEY;
    mockFindFirst.mockResolvedValue({ userId: "user-owner-1" });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 80,
      reset: Date.now() + 60_000,
      remaining: 79,
    });
  });

  afterEach(() => {
    delete process.env.SLUGY_API_KEY;
  });

  it("returns missing when SLUGY_API_KEY env var is not set", async () => {
    delete process.env.SLUGY_API_KEY;
    const result = await resolveApiKeyAuth(
      makeRequest(`Bearer ${VALID_KEY}`),
      "my-workspace",
    );
    expect(result).toEqual({ success: false, reason: "missing" });
  });

  it("returns missing when Authorization header is absent", async () => {
    const result = await resolveApiKeyAuth(makeRequest(), "my-workspace");
    expect(result).toEqual({ success: false, reason: "missing" });
  });

  it("returns missing when Authorization header has wrong scheme", async () => {
    const result = await resolveApiKeyAuth(
      makeRequest("Basic dXNlcjpwYXNz"),
      "my-workspace",
    );
    expect(result).toEqual({ success: false, reason: "missing" });
  });

  it("returns missing when Bearer token is empty", async () => {
    const result = await resolveApiKeyAuth(
      makeRequest("Bearer "),
      "my-workspace",
    );
    expect(result).toEqual({ success: false, reason: "missing" });
  });

  it("returns rate_limited when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      limit: 80,
      reset: Date.now() + 60_000,
      remaining: 0,
    });
    const result = await resolveApiKeyAuth(
      makeRequest(`Bearer ${VALID_KEY}`),
      "my-workspace",
    );
    expect(result).toEqual({
      success: false,
      reason: "rate_limited",
      limit: 80,
      remaining: 0,
      reset: expect.any(Number),
    });
  });

  it("returns invalid when key does not match env var", async () => {
    const result = await resolveApiKeyAuth(
      makeRequest(`Bearer ${OTHER_KEY}`),
      "my-workspace",
    );
    expect(result).toEqual({ success: false, reason: "invalid" });
  });

  it("returns invalid when workspace does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await resolveApiKeyAuth(
      makeRequest(`Bearer ${VALID_KEY}`),
      "nonexistent-workspace",
    );
    expect(result).toEqual({ success: false, reason: "invalid" });
  });

  it("returns success with workspace owner userId on valid key", async () => {
    const result = await resolveApiKeyAuth(
      makeRequest(`Bearer ${VALID_KEY}`),
      "my-workspace",
    );
    expect(result).toEqual({ success: true, userId: "user-owner-1" });
  });

  it("passes the hashed key to checkRateLimit, not the raw key", async () => {
    await resolveApiKeyAuth(makeRequest(`Bearer ${VALID_KEY}`), "my-workspace");
    expect(mockHashKey).toHaveBeenCalledWith(VALID_KEY);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(`hash-${VALID_KEY}`);
  });

  it("queries workspace with deletedAt: null filter", async () => {
    await resolveApiKeyAuth(makeRequest(`Bearer ${VALID_KEY}`), "my-workspace");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { slug: "my-workspace", deletedAt: null },
      select: { userId: true },
    });
  });
});
