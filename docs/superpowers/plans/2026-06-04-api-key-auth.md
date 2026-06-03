# API Key Authentication for Link Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `POST /api/workspace/{workspaceslug}/link` to authenticate via a fixed API key set in `SLUGY_API_KEY` env var, in addition to the existing session cookie auth.

**Architecture:** A new helper `src/lib/auth-api-key.ts` exports `resolveApiKeyAuth()`, which extracts the Bearer token, rate-limits on its hash, does a timing-safe compare against the env var, and returns the workspace owner's userId. The link route falls back to this helper when no session is present. All downstream logic is unchanged.

**Tech Stack:** TypeScript, Next.js App Router, Prisma (PostgreSQL), Upstash Redis (via `@upstash/redis`), `bun test` for unit tests.

---

## File Map

| File                                                  | Action     | Responsibility                                                                                |
| ----------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `src/lib/auth-api-key.ts`                             | **Create** | Extract, rate-limit, and validate the API key; return workspace owner userId                  |
| `src/lib/__tests__/auth-api-key.test.ts`              | **Create** | Unit tests for `resolveApiKeyAuth`                                                            |
| `src/app/api/workspace/[workspaceslug]/link/route.ts` | **Modify** | Wire `resolveApiKeyAuth` into the auth fallback; replace `session.user.id` with `actorUserId` |
| `.env.example`                                        | **Modify** | Document the new `SLUGY_API_KEY` variable                                                     |

---

## Task 1: Add `SLUGY_API_KEY` to `.env.example`

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Open `.env.example` and append the new variable**

Find the end of the file and add:

```bash
# Optional: enables API key auth for POST /api/workspace/*/link
# Generate with: openssl rand -hex 32
SLUGY_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: document SLUGY_API_KEY env var"
```

---

## Task 2: Create `src/lib/auth-api-key.ts`

**Files:**

- Create: `src/lib/auth-api-key.ts`

- [ ] **Step 1: Create the file with the full implementation**

```ts
import { timingSafeEqual } from "crypto";
import { db } from "@/server/db";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { hashKey } from "@/lib/redis";

export type ApiKeyAuthResult =
  | { success: true; userId: string }
  | { success: false; reason: "missing" | "invalid" }
  | {
      success: false;
      reason: "rate_limited";
      limit: number;
      reset: number;
      remaining: number;
    };

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Must be same length for timingSafeEqual; consume time before returning false
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function resolveApiKeyAuth(
  req: Request,
  workspaceSlug: string,
): Promise<ApiKeyAuthResult> {
  const envKey = process.env.SLUGY_API_KEY;
  if (!envKey) {
    return { success: false, reason: "missing" };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { success: false, reason: "missing" };
  }

  const providedKey = authHeader.slice(7); // len("Bearer ") === 7
  if (!providedKey) {
    return { success: false, reason: "missing" };
  }

  // Rate-limit on hashed key to prevent brute-force enumeration
  const rateResult = await checkRateLimit(hashKey(providedKey));
  if (!rateResult.success) {
    return {
      success: false,
      reason: "rate_limited",
      limit: rateResult.limit,
      reset: rateResult.reset,
      remaining: rateResult.remaining,
    };
  }

  if (!timingSafeStringEqual(providedKey, envKey)) {
    return { success: false, reason: "invalid" };
  }

  const workspace = await db.workspace.findFirst({
    where: { slug: workspaceSlug, deletedAt: null },
    select: { userId: true },
  });

  if (!workspace) {
    return { success: false, reason: "invalid" };
  }

  return { success: true, userId: workspace.userId };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run tsc --noEmit
```

Expected: no errors related to `auth-api-key.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-api-key.ts
git commit -m "feat: add resolveApiKeyAuth helper"
```

---

## Task 3: Unit tests for `resolveApiKeyAuth`

**Files:**

- Create: `src/lib/__tests__/auth-api-key.test.ts`

> **Note:** This project uses Bun. Run tests with `bun test`. Bun's test API is Jest-compatible (`describe`, `it`, `expect`, `mock`, `beforeEach`). Module mocking uses `mock.module()`.

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, mock, beforeEach } from "bun:test";

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
    process.env.SLUGY_API_KEY = VALID_KEY;
    mockFindFirst.mockResolvedValue({ userId: "user-owner-1" });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 80,
      reset: Date.now() + 60_000,
      remaining: 79,
    });
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
    expect(result).toMatchObject({ success: false, reason: "rate_limited" });
    expect(result).toHaveProperty("limit");
    expect(result).toHaveProperty("reset");
    expect(result).toHaveProperty("remaining");
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
```

- [ ] **Step 2: Run the tests and confirm they pass**

```bash
bun test src/lib/__tests__/auth-api-key.test.ts
```

Expected output: all 10 tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/auth-api-key.test.ts
git commit -m "test: add unit tests for resolveApiKeyAuth"
```

---

## Task 4: Wire `resolveApiKeyAuth` into the link creation route

**Files:**

- Modify: `src/app/api/workspace/[workspaceslug]/link/route.ts`

**What changes:**

1. Import `resolveApiKeyAuth`
2. Move `const context = await params` to before the auth block (needed for workspace slug)
3. Replace the hard-fail session block with session-OR-apikey logic
4. Replace `session.user.id` with `actorUserId` in the `tx.link.create` call

- [ ] **Step 1: Add import at the top of the file**

After the existing imports (around line 11), add:

```ts
import { resolveApiKeyAuth } from "@/lib/auth-api-key";
```

- [ ] **Step 2: Replace the auth block (lines 166–186 in current file)**

Replace this existing block:

```ts
// Authentication
const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  return jsonWithETag(req, apiErrorPayload("Unauthorized", "UNAUTHORIZED"), {
    status: 401,
  });
}

// Parse and validate input
const body = (await req.json()) as CreateLinkRequest;
const validatedData = createLinkSchema.parse(preprocessEmptyStrings(body));

// Check workspace access and limits
const context = await params;
const workspaceCheck = await getWorkspaceCreateContext(
  session.user.id,
  context.workspaceslug,
);
```

With this new block:

```ts
// Resolve workspace slug early — needed for API key auth
const context = await params;

// Authentication: session cookie first, then API key fallback
const session = await auth.api.getSession({ headers: await headers() });
let actorUserId: string;

if (session) {
  actorUserId = session.user.id;
} else {
  const apiKeyResult = await resolveApiKeyAuth(req, context.workspaceslug);
  if (!apiKeyResult.success) {
    if (apiKeyResult.reason === "rate_limited") {
      return jsonWithETag(
        req,
        apiErrorPayload("Too many requests", "RATE_LIMITED"),
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(apiKeyResult.limit),
            "X-RateLimit-Remaining": String(apiKeyResult.remaining),
            "X-RateLimit-Reset": String(apiKeyResult.reset),
          },
        },
      );
    }
    return jsonWithETag(req, apiErrorPayload("Unauthorized", "UNAUTHORIZED"), {
      status: 401,
    });
  }
  actorUserId = apiKeyResult.userId;
}

// Parse and validate input
const body = (await req.json()) as CreateLinkRequest;
const validatedData = createLinkSchema.parse(preprocessEmptyStrings(body));

// Check workspace access and limits
const workspaceCheck = await getWorkspaceCreateContext(
  actorUserId,
  context.workspaceslug,
);
```

- [ ] **Step 3: Replace `session.user.id` with `actorUserId` in `tx.link.create`**

Find (around line 219):

```ts
            userId: session.user.id,
```

Replace with:

```ts
            userId: actorUserId,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun run tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test — session auth still works**

Start the dev server:

```bash
bun run dev
```

In another terminal, log in to the app in a browser and use the existing "Create link" UI. Confirm a link is created successfully (tests that the session path is not broken).

- [ ] **Step 6: Manual smoke test — API key auth works**

With the dev server running, set `SLUGY_API_KEY` in your `.env.local`:

```bash
SLUGY_API_KEY=my-test-key-12345
```

Restart the dev server, then:

```bash
curl -s -X POST http://localhost:3000/api/workspace/<your-workspace-slug>/link \
  -H "Authorization: Bearer my-test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' | jq .
```

Expected response (HTTP 201):

```json
{
  "success": true,
  "data": {
    "id": "...",
    "url": "https://example.com",
    "slug": "...",
    ...
  }
}
```

- [ ] **Step 7: Manual smoke test — wrong key returns 401**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:3000/api/workspace/<your-workspace-slug>/link \
  -H "Authorization: Bearer wrong-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Expected: `401`

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/workspace/[workspaceslug]/link/route.ts"
git commit -m "feat: add API key auth fallback to link creation endpoint"
```
