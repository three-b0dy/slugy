# Design: Migrate Analytics from Tinybird to PostgreSQL

**Date:** 2026-06-04  
**Status:** Approved

## Overview

Replace Tinybird with a dedicated `analytics` PostgreSQL schema for all click event ingestion and querying. Remove all Tinybird dependencies, files, and environment variables.

**Constraints:**

- No historical data migration — start fresh from migration date
- Fire-and-forget write pattern (unchanged from current Tinybird behavior)
- Prisma manages schema; raw SQL via `neon.ts` for analytics queries
- 90-day data retention enforced by a daily cron job

---

## 1. Database Schema

### Context: existing `Analytics` model

There is already an `Analytics` model in the Prisma schema (`@@map("analytics")`) in the **public** schema. It is missing `workspaceId`, `slug`, `url`, and `domain`, and has a cascade-delete foreign key to `Link`. It cannot support workspace-scoped analytics queries without extra joins, so it is **not** used for this feature.

The new model lives in a separate **PostgreSQL schema** named `analytics` (distinct from the existing `public.analytics` table). No conflict — `analytics.click_events` vs `public.analytics` are fully separate objects.

### Prisma `multiSchema` setup

Add to `schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters", "fullTextSearchPostgres", "multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "analytics"]
}
```

### New model: `ClickEvent`

```prisma
model ClickEvent {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  linkId      String
  workspaceId String
  slug        String
  url         String
  domain      String
  ip          String
  country     String   @default("")
  city        String   @default("")
  continent   String   @default("")
  device      String   @default("")
  browser     String   @default("")
  os          String   @default("")
  ua          String   @default("")
  referer     String   @default("")
  trigger     String   @default("")
  userId      String?
  utmSource   String   @default("")
  utmMedium   String   @default("")
  utmCampaign String   @default("")
  utmTerm     String   @default("")
  utmContent  String   @default("")

  @@index([workspaceId, timestamp])
  @@index([workspaceId, linkId, timestamp])
  @@map("click_events")
  @@schema("analytics")
}
```

**Index rationale:**

- `(workspaceId, timestamp)` — covers all time-range queries scoped to a workspace
- `(workspaceId, linkId, timestamp)` — covers per-link filtered queries

**No foreign key to `links`** — analytics schema is intentionally decoupled from the main schema. Deleting a link does not cascade-delete its historical click data.

---

## 2. Write Path

### New file: `src/lib/analytics/track-click.ts`

Replaces `src/lib/tinybird/slugy_click_events.ts`. Writes one row to `analytics.click_events` via Prisma client.

```typescript
export async function recordClickEvent(event: ClickEventData): Promise<void> {
  await prisma.clickEvent.create({ data: event });
}
```

Interface `ClickEventData` maps directly from the existing `LinkClickEvent` shape (same fields, renamed from snake_case to camelCase for Prisma).

### Updated: `src/lib/middleware/track-analytics.ts`

- Remove import of `sendLinkClickEvent` from `@/lib/tinybird/slugy_click_events`
- Add import of `recordClickEvent` from `@/lib/analytics/track-click`
- Inside `dispatchAnalytics`, replace `sendLinkClickEvent(...)` with `recordClickEvent(...)` inside the existing `Promise.allSettled` — fire-and-forget behavior unchanged

### Removed: Link metadata sync

`src/lib/tinybird/slugy-links-metadata.ts` exported `sendLinkMetadata`, `deleteLink`, and `updateLink` — these synced link data to Tinybird so the analytics pipe could JOIN. PostgreSQL joins directly against the existing `links` table, so this entire sync mechanism is eliminated.

Remove calls to these functions from:

- `src/app/api/workspace/[workspaceslug]/link/route.ts`
- `src/app/api/workspace/[workspaceslug]/link/delete/route.ts`
- `src/app/api/workspace/[workspaceslug]/link/csv/route.ts`
- `src/app/api/workspace/[workspaceslug]/link/[linkId]/update/route.ts`
- `src/app/api/workspace/[workspaceslug]/link/[linkId]/delete/route.ts`

---

## 3. Read Path (Analytics API)

### Deleted: `src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts`

### New: `src/app/api/workspace/[workspaceslug]/analytics/route.ts`

Single SQL query replaces the Tinybird Pipe + TypeScript `transformTinybirdData` aggregation. The query returns rows in the same shape as the old `TinybirdResponse.data` so the transformation logic can be preserved or simplified.

```sql
SELECT
  ev.link_id,
  CASE
    WHEN $date_range = '24h' THEN date_trunc('hour', ev.timestamp)
    WHEN $date_range IN ('7d', '30d') THEN date_trunc('day', ev.timestamp)
    ELSE date_trunc('month', ev.timestamp)
  END AS day,
  COUNT(*) AS clicks,
  l.slug        AS "meta.slug",
  l.url         AS "meta.url",
  COALESCE(l.domain, $default_domain) AS domain,
  ev.country,
  ev.city,
  ev.continent,
  ev.device,
  ev.browser,
  ev.os,
  ev.referer
FROM analytics.click_events ev
JOIN "links" l ON l.id = ev."linkId"
WHERE ev."workspaceId" = $workspace_id
  AND ev.timestamp >= NOW() - $interval
  AND l."deletedAt" IS NULL
  AND ($slug    = '' OR l.slug      = $slug)
  AND ($url     = '' OR l.url       = $url)
  AND ($domain  = '' OR COALESCE(l.domain, $default_domain) = $domain)
  AND ($country = '' OR ev.country  = $country)
  AND ($city    = '' OR ev.city     = $city)
  AND ($continent = '' OR ev.continent = $continent)
  AND ($device  = '' OR ev.device   = $device)
  AND ($browser = '' OR ev.browser  = $browser)
  AND ($os      = '' OR ev.os       = $os)
  AND ($referer = '' OR ev.referer  = $referer)
GROUP BY 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
ORDER BY day DESC, clicks DESC
```

The `$interval` value is derived from `date_range` param: `24h→'1 day'`, `7d→'7 days'`, `30d→'30 days'`, `3m→'90 days'`, `12m→'365 days'`, `all→'3650 days'`.

The existing `transformTinybirdData` function and all metric aggregation logic in the route is reused as-is (same row shape), with Tinybird-specific types/references cleaned up. Cache headers are retained.

### Updated: `src/hooks/use-analytics.ts`

- Remove `useTinybird` parameter from `UseAnalyticsParams`
- Remove `useTinybird` branch in `fetchAnalyticsData` — hardcode endpoint to `/api/workspace/${workspaceslug}/analytics`
- Remove `useTinybird` from SWR key construction

---

## 4. 90-Day Data Retention

### New: `src/app/api/cron/cleanup-analytics/route.ts`

Protected by `Authorization: Bearer $CRON_SECRET` header check.

```typescript
DELETE FROM analytics.click_events
WHERE timestamp < NOW() - INTERVAL '90 days'
```

Returns count of deleted rows in response body.

**Scheduling:** Configure a daily cron in Dokploy (or any external cron) to call this endpoint:

- Schedule: `0 2 * * *` (02:00 daily)
- Method: `GET`
- Header: `Authorization: Bearer <CRON_SECRET>`

Add `CRON_SECRET` to `.env.example`.

---

## 5. Tinybird Removal Checklist

| Action           | Target                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| Delete directory | `src/lib/tinybird/`                                                              |
| Delete directory | `src/scripts/tinybird/`                                                          |
| Delete file      | `src/constants/tinybird.ts` (if exists)                                          |
| Delete route     | `src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts`              |
| Remove script    | `tinybird:setup` from `package.json`                                             |
| Remove env vars  | `TINYBIRD_API_KEY`, `TINYBIRD_API_URL`, `TINYBIRD_PIPE_NAME` from `.env.example` |
| Add env var      | `CRON_SECRET` to `.env.example`                                                  |
| Update           | All 5 link CRUD routes — remove Tinybird metadata sync calls                     |
| Update           | `src/lib/middleware/track-analytics.ts`                                          |
| Update           | `src/hooks/use-analytics.ts`                                                     |

---

## Non-Goals

- Historical data migration from Tinybird
- Materialized views or pre-aggregation tables
- Changes to Redis rate-limiting logic in `track-analytics.ts`
- Changes to `cacheAnalyticsEvent` / `analytics-cache.ts`
