# Tinybird → PostgreSQL Analytics Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tinybird with a dedicated `analytics` PostgreSQL schema for click event ingestion and querying, then delete all Tinybird code.

**Architecture:** Edge middleware (`proxy.ts` → `redirection.ts`) fires-and-forgets a `POST` to an internal Node.js ingest route, which writes to `analytics.click_events` via Prisma. The existing analytics query route is replaced with a raw SQL query that JOINs the `links` table directly — no metadata sync needed. A daily cron route deletes events older than 90 days.

**Tech Stack:** Prisma (multiSchema), `postgres` (postgres.js) raw SQL for reads, Next.js App Router, bun:test

---

## File Map

**Create:**

- `src/app/api/analytics/ingest/route.ts` — POST endpoint, writes click events to PostgreSQL
- `src/app/api/workspace/[workspaceslug]/analytics/route.ts` — GET analytics query (replaces tinybird route)
- `src/app/api/cron/cleanup-analytics/route.ts` — DELETE events older than 90 days
- `src/lib/__tests__/analytics-ingest.test.ts` — ingest route unit tests

**Modify:**

- `prisma/schema.prisma` — add `multiSchema`, `analytics` schema, `ClickEvent` model
- `src/lib/middleware/redirection.ts` — replace Tinybird call with internal fetch
- `src/hooks/use-analytics.ts` — remove `useTinybird` param and branch
- `src/app/api/workspace/[workspaceslug]/link/route.ts` — remove `sendLinkMetadata`
- `src/app/api/workspace/[workspaceslug]/link/delete/route.ts` — remove `deleteLink`
- `src/app/api/workspace/[workspaceslug]/link/csv/route.ts` — remove `sendLinkMetadata`
- `src/app/api/workspace/[workspaceslug]/link/[linkId]/update/route.ts` — remove `updateLink`
- `src/app/api/workspace/[workspaceslug]/link/[linkId]/delete/route.ts` — remove `deleteLink`
- `.env.example` — remove Tinybird vars, add `ANALYTICS_INGEST_SECRET` and `CRON_SECRET`

**Delete:**

- `src/lib/tinybird/` (entire directory: `tintbird.ts`, `slugy-links-metadata.ts`, `slugy_click_events.ts`)
- `src/lib/middleware/track-analytics.ts` (dead code — not imported anywhere)
- `src/scripts/tinybird/` (entire directory)
- `src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts`
- `src/constants/tinybird.ts` (if exists)

---

## Task 1: Prisma Schema — Add `analytics` Schema and `ClickEvent` Model

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `schema.prisma` — enable `multiSchema` and add `ClickEvent` model**

Replace the top of `schema.prisma` (the generator and datasource blocks):

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

Then add this model anywhere in `schema.prisma` (e.g. at the end of the file):

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

- [ ] **Step 2: Generate and apply the migration**

```bash
bun run db:generate
```

When prompted for a migration name, enter: `add_analytics_click_events`

Expected: Prisma creates `prisma/migrations/<timestamp>_add_analytics_click_events/migration.sql` containing `CREATE SCHEMA IF NOT EXISTS "analytics"` and `CREATE TABLE "analytics"."click_events" (...)`.

- [ ] **Step 3: Regenerate the Prisma client**

```bash
bunx prisma generate
```

Expected output: `✔ Generated Prisma Client` with no errors. After this step, `prisma.clickEvent` is available in the app.

- [ ] **Step 4: Verify the schema compiled cleanly**

```bash
bunx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid!`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add analytics schema and ClickEvent model to Prisma"
```

---

## Task 2: Analytics Ingest Route (Node.js, writes click events)

**Files:**

- Create: `src/app/api/analytics/ingest/route.ts`
- Create: `src/lib/__tests__/analytics-ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/analytics-ingest.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockCreate = mock(async () => ({ id: "ev_1" }));

mock.module("@/server/db", () => ({
  db: { clickEvent: { create: mockCreate } },
}));

process.env.ANALYTICS_INGEST_SECRET = "test-secret-abc";

const { POST } = await import("../../app/api/analytics/ingest/route");

function makeRequest(
  body: unknown,
  secret: string | null = "test-secret-abc",
): Request {
  return new Request("http://localhost/api/analytics/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  linkId: "link_1",
  workspaceId: "ws_1",
  slug: "hello",
  url: "https://example.com",
  domain: "slugy.co",
  ip: "1.2.3.4",
  country: "us",
  city: "New York",
  continent: "na",
  device: "desktop",
  browser: "chrome",
  os: "windows",
  ua: "Mozilla/5.0",
  referer: "Direct",
  trigger: "qr",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmTerm: "",
  utmContent: "",
};

describe("POST /api/analytics/ingest", () => {
  beforeEach(() => mockCreate.mockClear());

  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(makeRequest(validPayload, null));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when secret is wrong", async () => {
    const res = await POST(makeRequest(validPayload, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required fields", async () => {
    const res = await POST(makeRequest({ linkId: "link_1" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("writes the click event and returns 201 on success", async () => {
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0] as {
      data: typeof validPayload;
    };
    expect(callArg.data.linkId).toBe("link_1");
    expect(callArg.data.workspaceId).toBe("ws_1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/__tests__/analytics-ingest.test.ts
```

Expected: FAIL — `Cannot find module '../../app/api/analytics/ingest/route'`

- [ ] **Step 3: Implement the ingest route**

Create `src/app/api/analytics/ingest/route.ts`:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";

const clickEventSchema = z.object({
  linkId: z.string(),
  workspaceId: z.string(),
  slug: z.string(),
  url: z.string(),
  domain: z.string(),
  ip: z.string(),
  country: z.string().default(""),
  city: z.string().default(""),
  continent: z.string().default(""),
  device: z.string().default(""),
  browser: z.string().default(""),
  os: z.string().default(""),
  ua: z.string().default(""),
  referer: z.string().default(""),
  trigger: z.string().default(""),
  userId: z.string().nullable().optional(),
  utmSource: z.string().default(""),
  utmMedium: z.string().default(""),
  utmCampaign: z.string().default(""),
  utmTerm: z.string().default(""),
  utmContent: z.string().default(""),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const secret = process.env.ANALYTICS_INGEST_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = clickEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await db.clickEvent.create({ data: parsed.data });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/__tests__/analytics-ingest.test.ts
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analytics/ingest/route.ts src/lib/__tests__/analytics-ingest.test.ts
git commit -m "feat: add analytics ingest API route with auth guard"
```

---

## Task 3: Update `redirection.ts` — Replace Tinybird Call with Internal Fetch

**Files:**

- Modify: `src/lib/middleware/redirection.ts`

The current `trackAnalytics()` function at lines 264–326 calls `sendLinkClickEvent` inside `Promise.allSettled`. Replace the Tinybird call with a fetch to the ingest route.

- [ ] **Step 1: Update `redirection.ts` — remove Tinybird import, add ingest fetch**

Remove line 4:

```typescript
import { sendLinkClickEvent } from "@/lib/tinybird/slugy_click_events";
```

Replace the `trackAnalytics` function body. Find the existing function (lines ~264–326):

```typescript
async function trackAnalytics(
  req: NextRequest,
  linkId: string,
  slug: string,
  url: string,
  workspaceId: string,
  domain: string | undefined,
  trigger: string,
): Promise<void> {
```

Replace the entire function body with:

```typescript
async function trackAnalytics(
  req: NextRequest,
  linkId: string,
  slug: string,
  url: string,
  workspaceId: string,
  domain: string | undefined,
  trigger: string,
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const analytics = buildAnalyticsData(req, trigger);
    const utmParams = extractUTMParams(url);
    const finalDomain = domain || DEFAULT_DOMAIN;

    const cachedData: CachedAnalyticsData = {
      linkId,
      slug,
      workspaceId,
      url,
      domain,
      timestamp,
      ...analytics,
      utm_source: utmParams.utm_source ?? undefined,
      utm_medium: utmParams.utm_medium ?? undefined,
      utm_campaign: utmParams.utm_campaign ?? undefined,
      utm_term: utmParams.utm_term ?? undefined,
      utm_content: utmParams.utm_content ?? undefined,
    };

    const clickPayload = {
      linkId,
      workspaceId,
      slug,
      url,
      domain: finalDomain,
      ip: analytics.ipAddress,
      country: analytics.country,
      city: analytics.city,
      continent: analytics.continent,
      device: analytics.device,
      browser: analytics.browser,
      os: analytics.os,
      ua: req.headers.get("user-agent") ?? "",
      referer: analytics.referer,
      trigger: analytics.trigger,
      utmSource: utmParams.utm_source ?? "",
      utmMedium: utmParams.utm_medium ?? "",
      utmCampaign: utmParams.utm_campaign ?? "",
      utmTerm: utmParams.utm_term ?? "",
      utmContent: utmParams.utm_content ?? "",
    };

    void Promise.allSettled([
      fetch(`${req.nextUrl.origin}/api/analytics/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ANALYTICS_INGEST_SECRET ?? ""}`,
        },
        body: JSON.stringify(clickPayload),
      }).catch((err) => console.error("[Analytics Ingest Error]", err)),

      cacheAnalyticsEvent(cachedData),
    ]);
  } catch (err) {
    console.error("[Analytics Error]", err);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
bunx tsc --noEmit
```

Expected: No errors related to `redirection.ts` or missing Tinybird imports.

- [ ] **Step 3: Commit**

```bash
git add src/lib/middleware/redirection.ts
git commit -m "feat: replace Tinybird click event with internal analytics ingest fetch"
```

---

## Task 4: New Analytics Query Route

**Files:**

- Create: `src/app/api/workspace/[workspaceslug]/analytics/route.ts`

This replaces `src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts`. The existing `transformTinybirdData` function is copied here with Tinybird-specific type names cleaned up. The SQL query returns rows in the same shape so the transform logic is reused as-is.

- [ ] **Step 1: Create the new analytics route**

Create `src/app/api/workspace/[workspaceslug]/analytics/route.ts`:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { sql } from "@/server/neon";
import { apiErrors } from "@/lib/api-response";

type TimePeriod = "24h" | "7d" | "30d" | "3m" | "12m" | "all";
type AnalyticsMetric =
  | "totalClicks"
  | "clicksOverTime"
  | "links"
  | "cities"
  | "countries"
  | "continents"
  | "devices"
  | "browsers"
  | "oses"
  | "referrers"
  | "destinations";

type ClientMetric = AnalyticsMetric | "os";

interface ClickRow {
  link_id: string;
  day: string;
  clicks: number;
  "meta.slug": string;
  "meta.url": string;
  domain: string;
  country: string;
  city: string;
  continent: string;
  device: string;
  browser: string;
  os: string;
  referer: string;
}

const CACHE_DURATION = 60;
const STALE_WHILE_REVALIDATE = 60;

const analyticsPropsSchema = z
  .object({
    timePeriod: z.enum(["24h", "7d", "30d", "3m", "12m", "all"]),
    slug_key: z.string().nullable().optional(),
    country_key: z.string().nullable().optional(),
    city_key: z.string().nullable().optional(),
    continent_key: z.string().nullable().optional(),
    browser_key: z.string().nullable().optional(),
    os_key: z.string().nullable().optional(),
    referrer_key: z.string().nullable().optional(),
    device_key: z.string().nullable().optional(),
    destination_key: z.string().nullable().optional(),
    domain_key: z.string().nullable().optional(),
    metrics: z
      .array(
        z.enum([
          "totalClicks",
          "clicksOverTime",
          "links",
          "cities",
          "countries",
          "continents",
          "devices",
          "browsers",
          "os",
          "oses",
          "referrers",
          "destinations",
        ]),
      )
      .optional(),
  })
  .strict();

function getInterval(period: TimePeriod): string {
  const map: Record<TimePeriod, string> = {
    "24h": "1 day",
    "7d": "7 days",
    "30d": "30 days",
    "3m": "90 days",
    "12m": "365 days",
    all: "3650 days",
  };
  return map[period];
}

function getTimeKey(day: string, timePeriod: TimePeriod): string {
  const dayDate = new Date(day);
  if (timePeriod === "24h") {
    const hourDate = new Date(dayDate);
    hourDate.setMinutes(0, 0, 0);
    return hourDate.toISOString();
  } else if (timePeriod === "7d" || timePeriod === "30d") {
    return day.includes("T") ? dayDate.toISOString().split("T")[0]! : day;
  } else {
    const yearMonth = day.includes("T")
      ? dayDate.toISOString().substring(0, 7)
      : day.substring(0, 7);
    return yearMonth + "-01";
  }
}

function transformRows(
  rows: ClickRow[],
  requestedMetrics: AnalyticsMetric[],
  timePeriod: TimePeriod,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const metricSet = new Set(requestedMetrics);

  const timeMap = metricSet.has("clicksOverTime")
    ? new Map<string, number>()
    : null;
  const linksMap = metricSet.has("links")
    ? new Map<
        string,
        { slug: string; url: string; domain: string; clicks: number }
      >()
    : null;
  const citiesMap = metricSet.has("cities")
    ? new Map<string, { city: string; country: string; clicks: number }>()
    : null;
  const countriesMap = metricSet.has("countries")
    ? new Map<string, { country: string; clicks: number }>()
    : null;
  const continentsMap = metricSet.has("continents")
    ? new Map<string, { continent: string; clicks: number }>()
    : null;
  const devicesMap = metricSet.has("devices")
    ? new Map<string, { device: string; clicks: number }>()
    : null;
  const browsersMap = metricSet.has("browsers")
    ? new Map<string, { browser: string; clicks: number }>()
    : null;
  const osesMap = metricSet.has("oses")
    ? new Map<string, { os: string; clicks: number }>()
    : null;
  const referrersMap = metricSet.has("referrers")
    ? new Map<string, { referrer: string; clicks: number }>()
    : null;
  const destinationsMap = metricSet.has("destinations")
    ? new Map<string, { destination: string; clicks: number }>()
    : null;

  let totalClicks = 0;

  for (const item of rows) {
    const clicks = item.clicks;
    if (metricSet.has("totalClicks")) totalClicks += clicks;

    if (timeMap) {
      const timeKey = getTimeKey(item.day, timePeriod);
      timeMap.set(timeKey, (timeMap.get(timeKey) ?? 0) + clicks);
    }

    if (linksMap) {
      const key = `${item["meta.slug"]}-${item["meta.url"]}-${item.domain}`;
      const existing = linksMap.get(key);
      if (existing) existing.clicks += clicks;
      else
        linksMap.set(key, {
          slug: item["meta.slug"],
          url: item["meta.url"],
          domain: item.domain,
          clicks,
        });
    }

    if (citiesMap && item.city) {
      const key = `${item.city}-${item.country}`;
      const existing = citiesMap.get(key);
      if (existing) existing.clicks += clicks;
      else
        citiesMap.set(key, {
          city: item.city,
          country: item.country || "unknown",
          clicks,
        });
    }

    if (countriesMap && item.country) {
      const existing = countriesMap.get(item.country);
      if (existing) existing.clicks += clicks;
      else countriesMap.set(item.country, { country: item.country, clicks });
    }

    if (continentsMap && item.continent) {
      const existing = continentsMap.get(item.continent);
      if (existing) existing.clicks += clicks;
      else
        continentsMap.set(item.continent, {
          continent: item.continent,
          clicks,
        });
    }

    if (devicesMap && item.device) {
      const existing = devicesMap.get(item.device);
      if (existing) existing.clicks += clicks;
      else devicesMap.set(item.device, { device: item.device, clicks });
    }

    if (browsersMap && item.browser) {
      const existing = browsersMap.get(item.browser);
      if (existing) existing.clicks += clicks;
      else browsersMap.set(item.browser, { browser: item.browser, clicks });
    }

    if (osesMap && item.os && item.os !== "unknown") {
      const existing = osesMap.get(item.os);
      if (existing) existing.clicks += clicks;
      else osesMap.set(item.os, { os: item.os, clicks });
    }

    if (referrersMap && item.referer) {
      const existing = referrersMap.get(item.referer);
      if (existing) existing.clicks += clicks;
      else referrersMap.set(item.referer, { referrer: item.referer, clicks });
    }

    if (destinationsMap && item["meta.url"]) {
      const existing = destinationsMap.get(item["meta.url"]);
      if (existing) existing.clicks += clicks;
      else
        destinationsMap.set(item["meta.url"], {
          destination: item["meta.url"],
          clicks,
        });
    }
  }

  if (metricSet.has("totalClicks")) result.totalClicks = totalClicks;

  if (timeMap)
    result.clicksOverTime = Array.from(timeMap.entries())
      .map(([time, clicks]) => ({ time: new Date(time), clicks }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());

  const sortByClicks = <T extends { clicks: number }>(arr: T[]) =>
    arr.sort((a, b) => b.clicks - a.clicks);

  if (linksMap) result.links = sortByClicks(Array.from(linksMap.values()));
  if (citiesMap) result.cities = sortByClicks(Array.from(citiesMap.values()));
  if (countriesMap)
    result.countries = sortByClicks(Array.from(countriesMap.values()));
  if (continentsMap)
    result.continents = sortByClicks(Array.from(continentsMap.values()));
  if (devicesMap)
    result.devices = sortByClicks(Array.from(devicesMap.values()));
  if (browsersMap)
    result.browsers = sortByClicks(Array.from(browsersMap.values()));
  if (osesMap) result.oses = sortByClicks(Array.from(osesMap.values()));
  if (referrersMap)
    result.referrers = sortByClicks(Array.from(referrersMap.values()));
  if (destinationsMap)
    result.destinations = sortByClicks(Array.from(destinationsMap.values()));

  return result;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceslug: string }> },
) {
  try {
    const { workspaceslug } = await params;
    const search = request.nextUrl.searchParams;

    const raw = {
      timePeriod: (search.get("time_period") as TimePeriod) || "24h",
      slug_key: search.get("slug_key") || null,
      country_key: search.get("country_key") || null,
      city_key: search.get("city_key") || null,
      continent_key: search.get("continent_key") || null,
      browser_key: search.get("browser_key") || null,
      os_key: search.get("os_key") || null,
      referrer_key: search.get("referrer_key") || null,
      device_key: search.get("device_key") || null,
      destination_key: search.get("destination_key") || null,
      domain_key: search.get("domain_key") || null,
      metrics: search.get("metrics")
        ? (search.get("metrics")!.split(",").filter(Boolean) as ClientMetric[])
        : undefined,
    };

    const props = analyticsPropsSchema.parse(raw);

    const authResult = await getAuthSession();
    if (!authResult.success) return apiErrors.unauthorized();
    const session = authResult.session;

    const workspaceResult = await sql`
      SELECT id FROM "workspaces"
      WHERE slug = ${workspaceslug}
        AND "deletedAt" IS NULL
        AND (
          "userId" = ${session.user.id}
          OR EXISTS (
            SELECT 1 FROM "members" m
            WHERE m."workspaceId" = "workspaces".id
              AND m."userId" = ${session.user.id}
          )
        )
    `;

    if (workspaceResult.length === 0)
      return apiErrors.notFound("Workspace not found");

    const workspaceId = workspaceResult[0].id as string;

    const requestedMetrics = props.metrics ?? [
      "totalClicks",
      "clicksOverTime",
      "links",
      "cities",
      "countries",
      "continents",
      "devices",
      "browsers",
      "oses",
      "referrers",
      "destinations",
    ];

    const normalizedMetrics = Array.from(
      new Set(requestedMetrics.map((m) => (m === "os" ? "oses" : m))),
    ) as AnalyticsMetric[];

    const defaultDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co";
    const interval = getInterval(props.timePeriod);
    const slugFilter = props.slug_key || "";
    const urlFilter = props.destination_key || "";
    const domainFilter = props.domain_key || "";
    const countryFilter = props.country_key || "";
    const cityFilter = props.city_key || "";
    const continentFilter = props.continent_key || "";
    const deviceFilter = props.device_key || "";
    const browserFilter = props.browser_key || "";
    const osFilter = props.os_key || "";
    const refererFilter = props.referrer_key || "";

    const rows = await sql<ClickRow[]>`
      SELECT
        ev."linkId"                                        AS link_id,
        CASE
          WHEN ${props.timePeriod} = '24h'
            THEN date_trunc('hour', ev.timestamp)::text
          WHEN ${props.timePeriod} IN ('7d', '30d')
            THEN date_trunc('day', ev.timestamp)::text
          ELSE date_trunc('month', ev.timestamp)::text
        END                                                AS day,
        COUNT(*)::int                                      AS clicks,
        l.slug                                             AS "meta.slug",
        l.url                                              AS "meta.url",
        COALESCE(l.domain, ${defaultDomain})               AS domain,
        ev.country,
        ev.city,
        ev.continent,
        ev.device,
        ev.browser,
        ev.os,
        ev.referer
      FROM analytics.click_events ev
      JOIN links l ON l.id = ev."linkId"
      WHERE ev."workspaceId" = ${workspaceId}
        AND ev.timestamp >= NOW() - ${interval}::interval
        AND l."deletedAt" IS NULL
        AND (${slugFilter} = '' OR l.slug = ${slugFilter})
        AND (${urlFilter} = '' OR l.url = ${urlFilter})
        AND (${domainFilter} = '' OR COALESCE(l.domain, ${defaultDomain}) = ${domainFilter})
        AND (${countryFilter} = '' OR ev.country = ${countryFilter})
        AND (${cityFilter} = '' OR ev.city = ${cityFilter})
        AND (${continentFilter} = '' OR ev.continent = ${continentFilter})
        AND (${deviceFilter} = '' OR ev.device = ${deviceFilter})
        AND (${browserFilter} = '' OR ev.browser = ${browserFilter})
        AND (${osFilter} = '' OR ev.os = ${osFilter})
        AND (${refererFilter} = '' OR ev.referer = ${refererFilter})
      GROUP BY
        ev."linkId", day, l.slug, l.url,
        COALESCE(l.domain, ${defaultDomain}),
        ev.country, ev.city, ev.continent,
        ev.device, ev.browser, ev.os, ev.referer
      ORDER BY day DESC, clicks DESC
    `;

    const analyticsData = transformRows(
      rows,
      normalizedMetrics,
      props.timePeriod,
    );

    return NextResponse.json(analyticsData, {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        "X-Analytics-Metrics": normalizedMetrics.join(","),
        "X-Analytics-Period": props.timePeriod,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return apiErrors.validationError(err.errors, "Invalid parameters");
    console.error("Analytics API error:", err);
    return apiErrors.internalError("Server error");
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: No errors in the new route file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workspace/\[workspaceslug\]/analytics/route.ts
git commit -m "feat: add PostgreSQL analytics query route"
```

---

## Task 5: Cron Cleanup Route (90-day retention)

**Files:**

- Create: `src/app/api/cron/cleanup-analytics/route.ts`

- [ ] **Step 1: Create the cleanup route**

Create `src/app/api/cron/cleanup-analytics/route.ts`:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { primarySql } from "@/server/neon";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await primarySql`
    DELETE FROM analytics.click_events
    WHERE timestamp < NOW() - INTERVAL '90 days'
  `;

  return NextResponse.json({ deleted: result.count }, { status: 200 });
}
```

Note: Uses `primarySql` (write connection) not `sql` (read replica).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/cleanup-analytics/route.ts
git commit -m "feat: add 90-day analytics cleanup cron route"
```

---

## Task 6: Update `use-analytics.ts` Hook — Remove `useTinybird`

**Files:**

- Modify: `src/hooks/use-analytics.ts`

- [ ] **Step 1: Remove `useTinybird` from the hook**

In `src/hooks/use-analytics.ts`:

1. Remove `useTinybird?: boolean;` from the `UseAnalyticsParams` interface (line ~27)

2. In `fetchAnalyticsData`, remove the `useTinybird` parameter and replace the conditional endpoint with the fixed one. Change:

```typescript
const fetchAnalyticsData = async (
  workspaceslug: string,
  params: Record<string, string>,
  metrics?: Array<keyof AnalyticsData>,
  useTinybird: boolean = true,
): Promise<Partial<AnalyticsData>> => {
  // ...
  const endpoint = useTinybird
    ? `/api/workspace/${workspaceslug}/analytics/tinybird`
    : `/api/workspace/${workspaceslug}/analytics`;
```

To:

```typescript
const fetchAnalyticsData = async (
  workspaceslug: string,
  params: Record<string, string>,
  metrics?: Array<keyof AnalyticsData>,
): Promise<Partial<AnalyticsData>> => {
  // ...
  const endpoint = `/api/workspace/${workspaceslug}/analytics`;
```

3. In `useAnalytics`, remove `useTinybird = true` from the destructured params:

```typescript
export function useAnalytics({
  workspaceslug,
  timePeriod,
  searchParams = {},
  enabled = true,
  metrics = DEFAULT_METRICS,
}: UseAnalyticsParams) {
```

4. In the `swrKey` computation, remove the `useTinybird` reference:

```typescript
return ["analytics", sortedMetrics, workspaceslug, serializedParams];
```

5. In the `useSWR` call, remove `useTinybird` from the `fetchAnalyticsData` call:

```typescript
() =>
  fetchAnalyticsData(
    workspaceslug,
    debouncedSearchParams,
    [...metrics],
  ),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: No errors. If any component passes `useTinybird` prop to `useAnalytics`, that call will now error — fix by removing that prop at the call site.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-analytics.ts
git commit -m "feat: remove useTinybird from useAnalytics hook, hardcode postgres endpoint"
```

---

## Task 7: Remove Tinybird Metadata Sync from Link CRUD Routes

**Files:**

- Modify: `src/app/api/workspace/[workspaceslug]/link/route.ts`
- Modify: `src/app/api/workspace/[workspaceslug]/link/delete/route.ts`
- Modify: `src/app/api/workspace/[workspaceslug]/link/csv/route.ts`
- Modify: `src/app/api/workspace/[workspaceslug]/link/[linkId]/update/route.ts`
- Modify: `src/app/api/workspace/[workspaceslug]/link/[linkId]/delete/route.ts`

- [ ] **Step 1: `link/route.ts` — remove `sendLinkMetadata`**

Remove line 9:

```typescript
import { sendLinkMetadata } from "@/lib/tinybird/slugy-links-metadata";
```

Remove lines 331–339 (the `void sendLinkMetadata({...})` block):

```typescript
void sendLinkMetadata({
  link_id: result.id,
  domain,
  slug: result.slug,
  url: result.url,
  tag_ids: result.tags.map((t) => t.tag.id),
  workspace_id: workspaceCheck.workspace.id,
  created_at: result.createdAt.toISOString(),
});
```

- [ ] **Step 2: `link/delete/route.ts` — remove `deleteLink`**

Remove line 8:

```typescript
import { deleteLink } from "@/lib/tinybird/slugy-links-metadata";
```

Remove the comment and loop at lines 80–94:

```typescript
// Mark links as deleted in Tinybird (non-blocking)
links.forEach((link) => {
  if (workspace.workspace) {
    const linkData = {
      id: link.id,
      domain: "slugy.co",
      slug: link.slug,
      url: link.url,
      workspaceId: workspace.workspace.id,
      createdAt: link.createdAt,
      tags: link.tags.map((t) => ({ tagId: t.tag.id })),
    };
    void deleteLink(linkData);
  }
});
```

- [ ] **Step 3: `link/csv/route.ts` — remove `sendLinkMetadata`**

Remove line 10:

```typescript
import { sendLinkMetadata } from "@/lib/tinybird/slugy-links-metadata";
```

Search for `void sendLinkMetadata(` in this file and delete that entire call block.

- [ ] **Step 4: `link/[linkId]/update/route.ts` — remove `updateLink`**

Remove line 8:

```typescript
import { updateLink } from "@/lib/tinybird/slugy-links-metadata";
```

Search for `void updateLink(` in this file and delete that entire call block.

- [ ] **Step 5: `link/[linkId]/delete/route.ts` — remove `deleteLink`**

Remove line 8:

```typescript
import { deleteLink } from "@/lib/tinybird/slugy-links-metadata";
```

Search for `void deleteLink(` in this file and delete that entire call block.

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
bunx tsc --noEmit
```

Expected: No errors. If any error mentions `sendLinkMetadata`, `updateLink`, or `deleteLink`, check that the import and all call sites were removed.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/workspace/\[workspaceslug\]/link/
git commit -m "feat: remove Tinybird link metadata sync from all CRUD routes"
```

---

## Task 8: Delete Tinybird Files and Update `.env.example`

**Files:**

- Delete: `src/lib/tinybird/` (directory)
- Delete: `src/lib/middleware/track-analytics.ts`
- Delete: `src/scripts/tinybird/` (directory)
- Delete: `src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts`
- Delete: `src/constants/tinybird.ts` (if exists)
- Modify: `.env.example`
- Modify: `package.json`

- [ ] **Step 1: Delete Tinybird directories and files**

```bash
rm -rf src/lib/tinybird/
rm -f src/lib/middleware/track-analytics.ts
rm -rf src/scripts/tinybird/
rm -f "src/app/api/workspace/[workspaceslug]/analytics/tinybird/route.ts"
rm -f src/constants/tinybird.ts
```

- [ ] **Step 2: Remove `tinybird:setup` script from `package.json`**

In `package.json`, find and remove this line from `"scripts"`:

```json
"tinybird:setup": "bun src/scripts/tinybird/setup.ts",
```

- [ ] **Step 3: Update `.env.example`**

Remove:

```
# tinybird
TINYBIRD_API_KEY=
```

Add before the S3 block:

```
# Analytics ingest secret (used to authenticate internal click event writes)
# Generate with: openssl rand -hex 32
ANALYTICS_INGEST_SECRET=

# Cron secret (used to authenticate the cleanup-analytics cron route)
# Generate with: openssl rand -hex 32
CRON_SECRET=
```

- [ ] **Step 4: Verify no remaining Tinybird references**

```bash
grep -r "tinybird\|Tinybird\|TINYBIRD" src/ --include="*.ts" --include="*.tsx" | grep -v ".next"
```

Expected: No output. If any references remain, fix them before continuing.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete all Tinybird files and update env.example"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Run all existing tests**

```bash
bun test
```

Expected: All tests pass. The new `analytics-ingest.test.ts` and existing tests all green.

- [ ] **Step 2: Start the dev server and verify redirect tracking works**

```bash
bun run dev
```

1. In a browser, navigate to `http://localhost:3000/<any-short-slug>`
2. Verify the redirect still works (you land on the destination URL)
3. Check server logs — confirm no `[Tinybird...]` errors, no `[Analytics Ingest Error]` errors
4. If `ANALYTICS_INGEST_SECRET` is set in `.env`, verify a row appears in `analytics.click_events` (check via `bun run db:studio` → Analytics → click_events table)

- [ ] **Step 3: Verify analytics dashboard loads**

1. In browser, go to the workspace analytics page
2. Confirm data loads without errors (will be empty if no clicks recorded yet, but should not show API errors)
3. Check network tab — the request goes to `/api/workspace/<slug>/analytics` (not `/analytics/tinybird`)

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues found during e2e verification"
```

---

## Dokploy Cron Setup (Post-Deploy)

After deploying, configure the daily cleanup in Dokploy (or any external cron service):

| Setting  | Value                                              |
| -------- | -------------------------------------------------- |
| Schedule | `0 2 * * *`                                        |
| Method   | `GET`                                              |
| URL      | `https://<your-domain>/api/cron/cleanup-analytics` |
| Header   | `Authorization: Bearer <CRON_SECRET>`              |

Also set these environment variables in Dokploy:

- `ANALYTICS_INGEST_SECRET` — generate with `openssl rand -hex 32`
- `CRON_SECRET` — generate with `openssl rand -hex 32`
- Remove `TINYBIRD_API_KEY`, `TINYBIRD_API_URL`, `TINYBIRD_PIPE_NAME` if set
