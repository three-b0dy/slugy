# Personal Cleanup Design

**Date:** 2026-06-03
**Goal:** Transform Slugy from a multi-tenant SaaS platform into a self-hosted personal tool by removing payment, quota, domain management, and monitoring modules.

---

## Context

Slugy is a Next.js URL shortener with Prisma/PostgreSQL, Redis, Tinybird analytics, and Cloudflare R2 storage. The SaaS version includes paid subscription tiers, per-workspace quotas, dynamic custom domain provisioning, and third-party error monitoring. None of these are needed for personal self-hosted use.

---

## What We Keep

| Feature | Why |
|---|---|
| Core link management | Primary purpose of the app |
| Tinybird analytics (complete) | Full click tracking retained |
| Bio links | Useful personal feature |
| Team collaboration (Member, Invitation, Organization) | May share with others |
| Auth (better-auth, Resend email) | Magic link / password login |
| Cloudflare R2 image storage | Link covers, workspace logos |
| Redis (Upstash) | Caching layer |
| AI slug generation (Gemini) | Useful utility |
| Prisma / PostgreSQL (Neon) | Core database, read replica optional via env var |

---

## What We Remove

### Module 1: Payment System (Polar.sh)

**Packages to remove:**
- `@polar-sh/better-auth`
- `@polar-sh/nextjs`
- `@polar-sh/sdk`
- `@stripe/stripe-js`

**Files to delete:**
- `src/lib/polar.ts`
- `src/store/subscription.ts`

**API routes to delete:**
- `src/app/api/subscription/active/route.ts`
- `src/app/api/subscription/checkout/route.ts`
- `src/app/api/subscription/manage/route.ts`
- `src/app/api/webhook/polar/route.ts`
- `src/app/api/admin/subscription-debug/route.ts`

**UI pages to delete:**
- `src/app/app/(dashboard)/[workspace]/settings/billing/page.tsx`
- `src/app/app/(dashboard)/[workspace]/settings/billing/upgrade/page.tsx`
- `src/app/app/(others)/upgrade/` (entire directory)
- `src/app/app/(onboarding)/onboarding/plans/page.tsx`
- `src/app/(root)/pricing/page.tsx`

**Components to delete:**
- `src/components/app-pricing-comparator.tsx`
- `src/components/pricing-comparator.tsx`

**Prisma schema changes:**
- Delete models: `Plan`, `Subscription`, `SubscriptionHistory`
- Delete enums: `PlanType`, `Interval`, `SubscriptionStatus`
- Remove field `customerId` from `User`
- Remove relations `subscription` and `Usage[]` from `User`

**Env vars to remove from `.env.example`:**
- `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `NEXT_PUBLIC_PRO_YEARLY_PRICE_ID`, `NEXT_PUBLIC_PRO_MONTHLY_PRODUCT_ID`

**Additional files to delete (subscription logic layers):**
- `src/lib/subscription/basic-entitlement.ts`
- `src/lib/subscription/limits-sync.ts`
- `src/lib/subscription/reconcile.ts`
- `src/lib/usage/current-usage.ts`
- `src/server/actions/subscription.ts`
- `src/server/actions/limit.ts`
- `src/constants/data/price.ts`
- `src/components/web/subscribe-button.tsx`

**Code cleanup in retained files:**
- `src/server/actions/workspace/workspace.ts`: remove `checkWorkspaceLimit` call, keep workspace CRUD logic
- `src/server/actions/bio-gallery/bio-gallery.ts`: remove `checkBioGalleryLimit` / `checkBioGalleryLinkLimit` calls
- `src/components/web/_links/create-link.tsx` and `link-form.tsx`: remove `useSubscriptionStore` import, `isPro`/`isFreePlan` checks (features become unconditionally available)
- Other link components referencing `isPro`: remove gating, keep functionality
- `src/constants/data/navitems.ts`: remove `{ title: "Pricing", href: "/pricing" }` nav link
- Remove billing nav link from settings sidebar

---

### Module 2: Quota Limits & Scheduled Tasks (QStash)

**Packages to remove:**
- `@upstash/qstash`

**Files to delete:**
- `src/lib/qstash.ts`
- `src/lib/usage-period.ts`
- `src/scripts/setup-cron.ts`
- `src/scripts/test-usage-periods.ts`
- `src/scripts/setup-analytics-batch.ts`
- `src/scripts/test-batch-flow.ts`
- `src/scripts/clean-corrupted-cache.ts`
- `src/scripts/cleanup-corrupted-analytics.ts`
- `src/scripts/cleanup-orphaned-analytics.ts`
- `src/scripts/migrate-analytics-cache.ts`

**API routes to delete:**
- `src/app/api/cron/usage/route.ts`
- `src/app/api/cron/subscription-renewal/route.ts`
- `src/app/api/workspace/[workspaceslug]/usages/route.ts`
- `src/app/api/analytics/usages/route.ts`

**Prisma schema changes:**
- Delete model: `Usage`
- Remove from `Workspace`: `linksUsage`, `clicksUsage`, `maxLinksLimit`, `maxClicksLimit`, `maxUsers`, `maxLinkTags`, `addedUsers`
- Remove from `Bio`: `linksUsage`, `clicksUsage`, `maxLinksLimit`, `maxClicksLimit`

**Additional files to delete:**
- `src/server/actions/usages/get-usages.ts`

**package.json scripts to remove:**
- `setup:cron`
- `test:usage`

**Env vars to remove from `.env.example`:**
- `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`

**Code cleanup:**
- Remove quota guard checks in `src/app/api/workspace/[workspaceslug]/link/route.ts` (the `maxLinksLimit` check)
- Remove usage increment calls in link creation/deletion routes

---

### Module 3: Dynamic Domain Binding (Cloudflare Custom Hostnames + Vercel Domain API)

**Files to delete:**
- `src/lib/domain-utils.ts`

**API routes to delete:**
- `src/app/api/workspace/[workspaceslug]/domains/route.ts`

**UI pages/components to delete:**
- `src/app/app/(dashboard)/[workspace]/domains/page.tsx`
- `src/app/app/(dashboard)/[workspace]/domains/page-client.tsx`
- `src/app/custom-domain/` (entire directory: layout, page, not-found)
- `src/components/web/_settings/add-domain-dialog.tsx`
- `src/components/web/_settings/domain-card.tsx`
- `src/components/web/_settings/domain-config-dialog.tsx`

**Prisma schema changes:**
- Delete model: `CustomDomain`
- Remove from `Link`: `customDomainId` field and `customDomain` relation
- **Keep** `Link.domain` field (part of `@@unique([slug, domain])` composite key)

**Env vars to remove from `.env.example`:**
- `CLOUDFLARE_API_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_FALLBACK_ORIGIN`
- `VERCEL_API_URL`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`

**Code cleanup:**
- Remove domains nav link from workspace settings sidebar
- Remove domain-related fields from workspace settings API response if present

---

### Module 4: Sentry Error Monitoring

**Packages to remove:**
- `@sentry/nextjs`

**Files to delete:**
- `sentry.edge.config.ts`
- `sentry.server.config.ts`
- `src/instrumentation.ts`
- `src/instrumentation-client.ts`
- `src/app/sentry-example-page/page.tsx`
- `src/app/api/sentry-example-api/route.ts`

**Config changes:**
- `next.config.ts`: unwrap `withSentryConfig(...)`, use plain `nextConfig` export

**Env vars to remove from `.env.example`:**
- `SENTRY_AUTH_TOKEN`

---

### Module 5: Vercel-Specific Services

**Packages to remove:**
- `@vercel/analytics`
- `@vercel/speed-insights`
- `@vercel/functions`

**Code changes:**
- `src/app/layout.tsx`: remove `<Analytics />` and `<SpeedInsights />` component imports and usage
- `src/app/api/rate-limit/route.ts`: audit — if it uses `@vercel/functions`, delete or rewrite

---

### Module 6: Dymo

**Packages to remove:**
- `dymo-api`

**Files to delete:**
- `src/lib/dymo.ts`

---

## Execution Plan

All work happens on a new branch `feat/personal-cleanup`. Six commits in sequence:

| Commit | Scope |
|---|---|
| 1 | Remove payment module (Polar + Stripe) |
| 2 | Remove quota limits & QStash cron |
| 3 | Remove dynamic domain binding |
| 4 | Remove Sentry |
| 5 | Remove Vercel analytics + Dymo |
| 6 | Cleanup `.env.example` + `package.json` scripts |

After each commit: `npm run build` should pass (or at least not have new errors).

---

## Non-Changes

- `DATABASE_REPLICA_URL`: already optional in code; no change needed, just remove from `.env.example` annotation or mark as optional
- `Link.domain` field: stays as-is (default `"slugy.co"`)
- `@upstash/redis`: stays (used for caching, unrelated to QStash)
- Navigation items for bio-links, analytics, settings (non-billing) stay intact
- All team/member/invitation flows stay intact
