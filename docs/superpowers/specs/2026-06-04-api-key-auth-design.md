# API Key Authentication for Link Creation

**Date:** 2026-06-04  
**Scope:** `POST /api/workspace/{workspaceslug}/link`  
**Approach:** Env-var fixed key, shared auth helper, reuse existing rate limiter

---

## Context

The link creation endpoint currently only accepts session cookie authentication. This design adds support for a single fixed API key defined via environment variable, enabling programmatic access from scripts or external tools in self-hosted environments.

The existing `WorkspaceApiKey` Prisma model exists for a future full API key system. This design does **not** touch that model — it is intentionally minimal and replaces cleanly when the full system is implemented.

---

## Architecture

### New file: `src/lib/auth-api-key.ts`

Single exported function:

```ts
type ApiKeyAuthResult =
  | { success: true; userId: string }
  | { success: false; reason: "missing" | "rate_limited" | "invalid" };

export async function resolveApiKeyAuth(
  req: Request,
  workspaceSlug: string,
): Promise<ApiKeyAuthResult>;
```

Responsibilities:

1. **Extract key** from `Authorization: Bearer <key>` header. Missing or malformed header → `{ success: false, reason: "missing" }`.
2. **Guard: env var absent** — if `SLUGY_API_KEY` is not set, return `{ success: false, reason: "missing" }`. API key path is closed when the variable is not configured.
3. **Rate limit** — call `checkRateLimit(hashKey(apiKey))`: `hashKey` from `src/lib/redis.ts`, `checkRateLimit` from `src/lib/middleware/rate-limit.ts`. Reuses `RATE_LIMITS.STANDARD` (80 req/min). Redis key format: `rate-limit:<hash>`, consistent with IP-based keys.
4. **Constant-time compare** — compare extracted key against `process.env.SLUGY_API_KEY` using a timing-safe comparison to prevent timing attacks.
5. **Fetch workspace owner** — on match, query DB for the workspace by slug and return its `userId` (owner).

### Modified file: `src/app/api/workspace/[workspaceslug]/link/route.ts`

Replace the current hard-fail on missing session with an OR fallback:

```ts
// Before
const session = await auth.api.getSession({ headers: await headers() });
if (!session) return 401;

// After
const session = await auth.api.getSession({ headers: await headers() });

let actorUserId: string;

if (session) {
  actorUserId = session.user.id;
} else {
  const apiKeyResult = await resolveApiKeyAuth(req, context.workspaceslug);
  if (!apiKeyResult.success) {
    if (apiKeyResult.reason === "rate_limited") return 429;
    return 401;
  }
  actorUserId = apiKeyResult.userId;
}
```

All downstream logic (workspace access check, link creation, tag handling) uses `actorUserId` unchanged.

### Modified file: `.env.example`

```bash
# Optional: enables API key auth for POST /api/workspace/*/link
# Generate with: openssl rand -hex 32
SLUGY_API_KEY=
```

---

## Request Format

```http
POST /api/workspace/{workspaceslug}/link
Authorization: Bearer <key>
Content-Type: application/json

{
  "url": "https://example.com",
  "slug": "my-link"
}
```

---

## Error Responses

| Scenario                         | HTTP | `code` field   |
| -------------------------------- | ---- | -------------- |
| No auth (no session, no header)  | 401  | `UNAUTHORIZED` |
| API key invalid or env var unset | 401  | `UNAUTHORIZED` |
| Rate limit exceeded              | 429  | `RATE_LIMITED` |

The 401 response does not distinguish between "wrong key" and "no key" to avoid information leakage.

Rate limit response includes headers:

```
X-RateLimit-Limit: 80
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix ms timestamp>
```

---

## Security Notes

- **Timing-safe compare**: prevents key enumeration via response timing.
- **Rate limiting on key hash**: 80 req/min cap prevents brute-force enumeration even if the key is weak.
- **No default value**: `SLUGY_API_KEY` has no default. Unset = feature disabled.
- **Hash in Redis key**: raw key is never stored in Redis; `hashKey()` (from `src/lib/redis.ts`) produces a non-reversible 32-bit integer in base36.

---

## Migration Path

When the full `WorkspaceApiKey` database system is implemented:

1. Replace `resolveApiKeyAuth` internals to query `WorkspaceApiKey` table instead of env var.
2. Remove `SLUGY_API_KEY` from `.env.example`.
3. The route diff is zero — `actorUserId` contract stays the same.

---

## Files Changed

| File                                                  | Change                  |
| ----------------------------------------------------- | ----------------------- |
| `src/lib/auth-api-key.ts`                             | New, ~50 lines          |
| `src/app/api/workspace/[workspaceslug]/link/route.ts` | Auth section, ~10 lines |
| `.env.example`                                        | +2 lines                |
