# Personal Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all SaaS-specific modules (payment, quota/cron, domain binding, Sentry, Vercel analytics) from Slugy, leaving a clean self-hosted personal URL shortener.

**Architecture:** Six sequential commits on `feat/personal-cleanup`. Each commit removes one module's files, packages, Prisma schema pieces, and code references. After each commit, `npm run build` must pass. A single Prisma migration is applied in the final task.

**Tech Stack:** Next.js 15, Prisma 6 + PostgreSQL (Neon), better-auth, Cloudflare R2, Tinybird, Upstash Redis, Resend.

---

## Pre-flight

- [ ] Confirm you are on branch `feat/personal-cleanup` (already created with spec commit)

```bash
git branch --show-current
# expected: feat/personal-cleanup
```

---

## Task 1: Remove Payment Module (Polar.sh + Stripe)

**Files to delete:**
- `src/lib/polar.ts`
- `src/store/subscription.ts`
- `src/lib/subscription/basic-entitlement.ts`
- `src/lib/subscription/limits-sync.ts`
- `src/lib/subscription/reconcile.ts`
- `src/server/actions/subscription.ts`
- `src/server/actions/limit.ts`
- `src/constants/data/price.ts`
- `src/components/app-pricing-comparator.tsx`
- `src/components/pricing-comparator.tsx`
- `src/components/web/subscribe-button.tsx`
- `src/components/web/_billing/legacy-free-upgrade-popup.tsx`
- `src/components/web/_pricing/pricing-section.tsx`
- `src/components/web/_sidebar/usage-stats.tsx`
- `src/components/web/_sidebar/usage-stats-client.tsx`
- `src/app/api/subscription/active/route.ts`
- `src/app/api/subscription/checkout/route.ts`
- `src/app/api/subscription/manage/route.ts`
- `src/app/api/webhook/polar/route.ts`
- `src/app/api/admin/subscription-debug/route.ts`
- `src/app/app/(dashboard)/[workspace]/settings/billing/page.tsx`
- `src/app/app/(dashboard)/[workspace]/settings/billing/upgrade/page.tsx`
- `src/app/app/(others)/upgrade/page.tsx`
- `src/app/app/(others)/upgrade/_components/create-sub-button.tsx`
- `src/app/app/(others)/upgrade/_components/update-sub-button.tsx`
- `src/app/app/(onboarding)/onboarding/plans/page.tsx`
- `src/app/(root)/pricing/page.tsx`

**Files to modify:**
- `package.json`
- `prisma/schema.prisma`
- `src/components/web/_sidebar/nav-main.tsx`
- `src/components/web/_sidebar/nav-user.tsx`
- `src/components/web/_sidebar/app-sidebar.tsx`
- `src/app/app/layout.tsx`
- `src/server/actions/workspace/workspace.ts`
- `src/server/actions/bio-gallery/bio-gallery.ts`
- `src/components/web/_links/create-link.tsx`
- `src/components/web/_links/link-form.tsx`
- `src/components/web/_analytics/filter.tsx`

---

### Step 1.1 — Delete payment files

- [ ] Run the deletion commands:

```bash
# Lib + store
rm src/lib/polar.ts src/store/subscription.ts
rm -r src/lib/subscription src/lib/usage

# Server actions
rm src/server/actions/subscription.ts src/server/actions/limit.ts
rm -r src/server/actions/usages   # also covers usages/get-usages.ts (moved to Task 2 but safe to delete now)

# Constants
rm src/constants/data/price.ts

# Components
rm src/components/app-pricing-comparator.tsx src/components/pricing-comparator.tsx
rm src/components/web/subscribe-button.tsx
rm src/components/web/_billing/legacy-free-upgrade-popup.tsx
rm -r src/components/web/_pricing
rm src/components/web/_sidebar/usage-stats.tsx src/components/web/_sidebar/usage-stats-client.tsx

# API routes
rm src/app/api/subscription/active/route.ts
rm src/app/api/subscription/checkout/route.ts
rm src/app/api/subscription/manage/route.ts
rm -r src/app/api/subscription
rm -r src/app/api/webhook/polar
rm -r src/app/api/admin

# UI pages
rm src/app/app/\(dashboard\)/\[workspace\]/settings/billing/page.tsx
rm src/app/app/\(dashboard\)/\[workspace\]/settings/billing/upgrade/page.tsx
rmdir src/app/app/\(dashboard\)/\[workspace\]/settings/billing/upgrade 2>/dev/null || true
rmdir src/app/app/\(dashboard\)/\[workspace\]/settings/billing 2>/dev/null || true
rm -r "src/app/app/(others)/upgrade"
rm "src/app/app/(onboarding)/onboarding/plans/page.tsx"
rmdir "src/app/app/(onboarding)/onboarding/plans" 2>/dev/null || true
rm "src/app/(root)/pricing/page.tsx"
rmdir "src/app/(root)/pricing" 2>/dev/null || true
```

---

### Step 1.2 — Remove Polar + Stripe packages from package.json

- [ ] Open `package.json` and remove these lines from `"dependencies"`:

```json
"@polar-sh/better-auth": "^1.0.1",
"@polar-sh/nextjs": "^0.9.1",
"@polar-sh/sdk": "^0.32.16",
"@stripe/stripe-js": "^7.3.1",
```

---

### Step 1.3 — Remove Plan/Subscription models from Prisma schema

- [ ] Open `prisma/schema.prisma` and:

**Remove these enums** (find and delete the entire enum blocks):
```prisma
enum PlanType {
  basic
  pro
}

enum Interval {
  month
  year
}

enum SubscriptionStatus {
  active
  cancelled
  inactive
  pending
}
```

**Remove these models** (find and delete the entire model blocks):
- `model Plan { ... }` 
- `model Subscription { ... }`
- `model SubscriptionHistory { ... }`

**In `model User`**, remove these two lines:
```prisma
  customerId      String?
  subscription    Subscription?
```

**In `model User`**, also remove this relation line (part of the Usage removal in Task 2, but the relation must be gone when the models are removed):
```prisma
  Usage           Usage[]
```

---

### Step 1.4 — Regenerate Prisma client

- [ ] Run:

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

---

### Step 1.5 — Remove Billing from sidebar nav

- [ ] Edit `src/components/web/_sidebar/nav-main.tsx`:

Find the `SIDEBAR_DATA` constant and apply these two changes:

**Remove the `Domains` nav item** (the entire object):
```ts
// DELETE this line from navMain array:
{ title: "Domains", url: "/domains", icon: Globe },
```

**Remove the `Billing` sub-item from Settings**:
```ts
// In Settings.items, DELETE:
{ title: "Billing", url: "/settings/billing" },
```

**Remove unused import** — remove `Globe` from the lucide-react import line.

The `SIDEBAR_DATA.navMain` array after changes should be:
```ts
navMain: [
  { title: "Links", url: "/", icon: LinkIcon },
  { title: "Analytics", url: "/analytics", icon: BarChart2 },
  { title: "Bio Links", url: "/bio-links", icon: PhoneIcon },
  {
    title: "Settings",
    icon: SettingsIcon,
    items: [
      { title: "General", url: "/settings" },
      { title: "Library", url: "/settings/library/tags" },
      { title: "Team", url: "/settings/team" },
    ],
  },
] as NavItem[],
```

Also remove `Globe` from the lucide-react import at the top of the file:
```ts
// Before:
import { ChevronRight, BarChart2, SquareTerminal, type LucideIcon, Globe } from "lucide-react";
// After:
import { ChevronRight, BarChart2, SquareTerminal, type LucideIcon } from "lucide-react";
```

---

### Step 1.6 — Remove billing link from nav-user

- [ ] Edit `src/components/web/_sidebar/nav-user.tsx`:

Find and remove the `<Link href="/billing">` block (around line 134). Remove the entire list item containing that link. The exact block to delete will look like:

```tsx
<Link href="/billing">
  {/* ... Billing menu item content ... */}
</Link>
```

---

### Step 1.7 — Remove UsageStats from app-sidebar

- [ ] Edit `src/components/web/_sidebar/app-sidebar.tsx`:

Remove the import line:
```ts
import UsageStats from "./usage-stats";
```

Remove the component usage (around line 56):
```tsx
<UsageStats workspaceslug={workspaceslug} />
```

---

### Step 1.8 — Remove LegacyFreeUpgradePopup from app layout

- [ ] Edit `src/app/app/layout.tsx`:

Remove the import:
```ts
import LegacyFreeUpgradePopup from "@/components/web/_billing/legacy-free-upgrade-popup";
```

Remove the component usage:
```tsx
<LegacyFreeUpgradePopup />
```

The `AppLayout` JSX body after changes:
```tsx
<div className={cn("min-h-screen", geistSans.variable, geistMono.variable)}>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <div className="h-full">{children}</div>
    <SpeedInsights />
  </ThemeProvider>
</div>
```

(SpeedInsights will be removed in Task 5; leave it for now.)

---

### Step 1.9 — Remove Polar plugin from auth.ts

- [ ] Edit `src/lib/auth.ts`:

Remove these import lines (lines 9–10):
```ts
import { polar, checkout } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
```

Remove the lazy Polar client setup (lines 14 and 39–47):
```ts
let _polarClientAuth: Polar | null = null;

const getPolarServer = () =>
  process.env.NODE_ENV === "production" ? "production" : "sandbox";

const getPolarClient = () => {
  if (!_polarClientAuth) {
    _polarClientAuth = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN || "",
      server: getPolarServer(),
    });
  }
  return _polarClientAuth;
};
```

Remove the `polar(...)` plugin entry from the `plugins` array (lines 166–174):
```ts
    polar({
      client: getPolarClient(),
      createCustomerOnSignUp: false,
      use: [
        checkout({
          products: [],
        }),
      ],
    }),
```

After changes, the `plugins` array should start directly with `organization(...)`, followed by `admin()` and `nextCookies()`.

---

### Step 1.10 — Remove /pricing from public navbar visibility

- [ ] Edit `src/app/(root)/_components/navbar.tsx`:

Remove `"/pricing"` from the `VISIBLE_PATHS` set:
```ts
// Before:
const VISIBLE_PATHS = new Set([
  "/",
  "/tools/metadatas",
  "/pricing",
  "/sponsors",
]);

// After:
const VISIBLE_PATHS = new Set([
  "/",
  "/tools/metadatas",
  "/sponsors",
]);
```

---

### Step 1.11 — Remove Pricing link from public navbar constants

Remove this object from the `NAV_LINKS` array:
```ts
{
  title: "Pricing",
  href: "/pricing",
},
```

---

### Step 1.10 — Remove workspace limit check from workspace action

- [ ] Edit `src/server/actions/workspace/workspace.ts`:

Remove the import line:
```ts
import { checkWorkspaceLimit } from "@/server/actions/limit";
```

Find the `checkWorkspaceLimit` call (around line 50) and remove it along with the `if (!limitCheck.canCreate)` guard block. The workspace creation function should proceed directly to creating the workspace after auth checks.

---

### Step 1.11 — Remove bio gallery limit check from bio action

- [ ] Edit `src/server/actions/bio-gallery/bio-gallery.ts`:

Remove the import line:
```ts
import { checkBioGalleryLimit } from "../limit";
```

Find the `checkBioGalleryLimit` call (around line 37) and remove the call and its guard block. The bio gallery creation should proceed directly.

---

### Step 1.12 — Remove isPro gates from create-link component

- [ ] Edit `src/components/web/_links/create-link.tsx`:

Remove the import (line 29):
```ts
import { useSubscriptionStore } from "@/store/subscription";
```

Remove these lines from the component body (around lines 80–81):
```ts
const { isPro, fetchSubscription } = useSubscriptionStore();
const isFreePlan = !isPro;
```

Remove `isFreePlan` from the `isSubmitDisabled` useMemo dependency and the condition (around line 154):
```ts
// Before:
!isSafeToSubmit || isSubmitting || (isFreePlan && hasPremiumFeatures),
// After:
!isSafeToSubmit || isSubmitting,
```

Remove all `isFreePlan={isFreePlan}` props passed to child components (around lines 417, 424). Those child components' `isFreePlan` props will be handled in Step 1.13.

---

### Step 1.13 — Remove isPro gates from link-form component

- [ ] Edit `src/components/web/_links/link-form.tsx`:

Remove the import (line 60):
```ts
import { useSubscriptionStore } from "@/store/subscription";
```

Remove these lines from the component body (around lines 790–791):
```ts
const { isPro, fetchSubscription } = useSubscriptionStore();
const isFreePlan = !isPro;
```

Find all `isFreePlan` usages in the file and simplify:
- Props accepting `isFreePlan: boolean` → remove the prop
- `disabled={isFreePlan}` → remove the `disabled` prop
- Conditional renders like `isFreePlan ? <LockedUI> : <Feature>` → keep only `<Feature>`
- `if (!isFreePlan) { ... }` guard blocks → remove the guard, keep the block contents

---

### Step 1.14 — Remove isPro gates from analytics filter

- [ ] Edit `src/components/web/_analytics/filter.tsx`:

Remove the import (line 30):
```ts
import { useSubscriptionStore } from "@/store/subscription";
```

Remove these lines (around lines 467):
```ts
const { isPro, fetchSubscription } = useSubscriptionStore();
```

Remove the guard that blocks long date ranges for free plans (around line 531):
```ts
// DELETE this line:
if (!isPro && longRangeValues.includes(newTimePeriod)) return;
```

Remove all `isPro` props passed to child components and simplify conditional renders that gate features behind `isPro` (treat as always `true`).

---

### Step 1.15 — Verify build

- [ ] Run:

```bash
npm install
npx prisma generate
npm run build 2>&1 | tail -30
```

Expected: No TypeScript errors related to deleted files. If errors appear, grep for the missing symbol and remove the remaining reference.

```bash
# Helper: find any remaining references to deleted things
grep -r "useSubscriptionStore\|isPro\|isFreePlan\|polar\|PlanType\|Subscription\b" src --include="*.ts" --include="*.tsx" | grep -v "node_modules"
```

---

### Step 1.16 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: remove payment module (Polar, Stripe, subscription infrastructure)

Deletes Polar.sh integration, Stripe, subscription/plan DB models,
billing UI, usage stats sidebar, and all isPro feature gates.
Features are now unconditionally available.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove Quota Limits & QStash Cron

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
- `src/app/api/cron/usage/route.ts`
- `src/app/api/cron/subscription-renewal/route.ts`
- `src/app/api/workspace/[workspaceslug]/usages/route.ts`
- `src/app/api/analytics/usages/route.ts`

**Files to modify:**
- `package.json`
- `prisma/schema.prisma`
- `src/app/api/workspace/[workspaceslug]/link/route.ts`

---

### Step 2.1 — Delete QStash/cron/usage files

- [ ] Run:

```bash
rm src/lib/qstash.ts src/lib/usage-period.ts
rm -r src/scripts   # removes all cron/usage maintenance scripts
rm -r src/app/api/cron
rm "src/app/api/workspace/[workspaceslug]/usages/route.ts"
rmdir "src/app/api/workspace/[workspaceslug]/usages" 2>/dev/null || true
rm src/app/api/analytics/usages/route.ts
rmdir src/app/api/analytics/usages 2>/dev/null || true
```

---

### Step 2.2 — Remove @upstash/qstash package

- [ ] Edit `package.json`, remove from `"dependencies"`:

```json
"@upstash/qstash": "^2.8.1",
```

---

### Step 2.3 — Remove package.json scripts for cron

- [ ] Edit `package.json`, remove from `"scripts"`:

```json
"setup:cron": "ts-node --project tsconfig.scripts.json src/scripts/setup-cron.ts",
"test:usage": "ts-node --project tsconfig.scripts.json src/scripts/test-usage-periods.ts",
```

---

### Step 2.4 — Remove Usage model and quota fields from Prisma schema

- [ ] Open `prisma/schema.prisma` and:

**Delete the entire `model Usage { ... }` block.**

**In `model Workspace`**, remove these fields:
```prisma
  linksUsage     Int      @default(0)
  clicksUsage    Int      @default(0)
  maxLinksLimit  Int      @default(20)
  maxClicksLimit Int      @default(1000)
  maxUsers       Int      @default(1)
  maxLinkTags    Int      @default(5)
  addedUsers     Int      @default(1)
```
Also remove the `usages` relation:
```prisma
  usages           Usage[]
```

**In `model Bio`**, remove these fields:
```prisma
  linksUsage     Int      @default(0)
  clicksUsage    Int      @default(0)
  maxLinksLimit  Int      @default(5)
  maxClicksLimit Int      @default(1000)
```

---

### Step 2.5 — Remove quota guard from link creation API

- [ ] Edit `src/app/api/workspace/[workspaceslug]/link/route.ts`:

Find and remove any import of `checkWorkspaceAccessAndLimits` or similar limit-checking functions.

Find the limit check block (it checks `canCreateLinks` or `maxLinksLimit`) and remove the entire guard. The POST handler should proceed to create the link after workspace access check, without a link count limit.

Verify by checking for remaining quota-related imports:
```bash
grep -n "limit\|usage\|quota\|maxLinks\|canCreate" "src/app/api/workspace/[workspaceslug]/link/route.ts"
```

---

### Step 2.6 — Regenerate Prisma client and verify build

- [ ] Run:

```bash
npm install
npx prisma generate
npm run build 2>&1 | tail -30
```

```bash
# Check for stray references
grep -r "qstash\|QStash\|usage-period\|linksUsage\|clicksUsage\|maxLinksLimit\|maxClicksLimit\|addedUsers" src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

---

### Step 2.7 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: remove quota limits and QStash cron scheduling

Deletes Usage model, per-workspace quota fields, QStash cron
routes, and all quota guard checks. Links and bio galleries
can now be created without any per-plan limits.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove Dynamic Domain Binding

**Files to delete:**
- `src/lib/domain-utils.ts`
- `src/app/api/workspace/[workspaceslug]/domains/route.ts`
- `src/app/app/(dashboard)/[workspace]/domains/page.tsx`
- `src/app/app/(dashboard)/[workspace]/domains/page-client.tsx`
- `src/app/custom-domain/layout.tsx`
- `src/app/custom-domain/page.tsx`
- `src/app/custom-domain/not-found.tsx`
- `src/components/web/_settings/add-domain-dialog.tsx`
- `src/components/web/_settings/domain-card.tsx`
- `src/components/web/_settings/domain-config-dialog.tsx`

**Files to modify:**
- `prisma/schema.prisma`

---

### Step 3.1 — Delete domain files

- [ ] Run:

```bash
rm src/lib/domain-utils.ts
rm "src/app/api/workspace/[workspaceslug]/domains/route.ts"
rmdir "src/app/api/workspace/[workspaceslug]/domains" 2>/dev/null || true
rm "src/app/app/(dashboard)/[workspace]/domains/page.tsx"
rm "src/app/app/(dashboard)/[workspace]/domains/page-client.tsx"
rmdir "src/app/app/(dashboard)/[workspace]/domains" 2>/dev/null || true
rm -r src/app/custom-domain
rm src/components/web/_settings/add-domain-dialog.tsx
rm src/components/web/_settings/domain-card.tsx
rm src/components/web/_settings/domain-config-dialog.tsx
```

---

### Step 3.2 — Remove CustomDomain model from Prisma schema

- [ ] Open `prisma/schema.prisma` and:

**Delete the entire `model CustomDomain { ... }` block.**

**In `model Link`**, remove these two lines:
```prisma
  customDomainId String?
  customDomain    CustomDomain?    @relation(fields: [customDomainId], references: [id], onDelete: Cascade)
```

Also remove the index that references customDomainId if present:
```prisma
  @@index([workspaceId, domain])
```
(Keep this index only if it doesn't reference customDomainId directly — check the schema.)

**In `model Workspace`**, remove:
```prisma
  customDomains    CustomDomain[]
```

---

### Step 3.3 — Regenerate Prisma client and verify build

- [ ] Run:

```bash
npx prisma generate
npm run build 2>&1 | tail -30
```

```bash
# Check for stray domain references
grep -r "customDomain\|CustomDomain\|domain-utils\|addDomainToVercel\|CLOUDFLARE_API" src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

---

### Step 3.4 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: remove dynamic domain binding (Cloudflare Custom Hostnames + Vercel API)

Deletes CustomDomain model, domain management UI/API, and domain-utils.
The app operates on a single fixed domain only.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove Sentry Error Monitoring

**Files to delete:**
- `sentry.edge.config.ts`
- `sentry.server.config.ts`
- `src/instrumentation.ts`
- `src/instrumentation-client.ts`
- `src/app/sentry-example-page/page.tsx`
- `src/app/api/sentry-example-api/route.ts`

**Files to modify:**
- `package.json`
- `next.config.ts`

---

### Step 4.1 — Delete Sentry files

- [ ] Run:

```bash
rm sentry.edge.config.ts sentry.server.config.ts
rm src/instrumentation.ts src/instrumentation-client.ts
rm -r src/app/sentry-example-page
rm src/app/api/sentry-example-api/route.ts
rmdir src/app/api/sentry-example-api 2>/dev/null || true
```

---

### Step 4.2 — Remove @sentry/nextjs package

- [ ] Edit `package.json`, remove from `"dependencies"`:

```json
"@sentry/nextjs": "^10.32.1",
```

---

### Step 4.3 — Unwrap next.config.ts from Sentry

- [ ] Replace the entire content of `next.config.ts` with the unwrapped version:

```ts
const nextConfig: import("next").NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["oxidize-ashen-pastel.ngrok-free.dev"],

  images: {
    remotePatterns: [
      { hostname: "public.blob.vercel-storage.com" },
      { hostname: "res.cloudinary.com" },
      { hostname: "zplink.s3.ap-south-1.amazonaws.com" },
      { hostname: "files.slugy.co" },
      { hostname: "opengraph.b-cdn.net" },
      { hostname: "api.producthunt.com" },
      { hostname: "img.shields.io" },
      { hostname: "peerlist.io" },
      { hostname: "github.com" },
      { hostname: "direct" },
      { hostname: "images.unsplash.com" },
      { hostname: "abs.twimg.com" },
      { hostname: "pbs.twimg.com" },
      { hostname: "avatar.vercel.sh" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "api.dicebear.com" },
      { hostname: "img.icons8.com" },
      { hostname: "twenty-icons.com" },
      { hostname: "favicone.com" },
      { hostname: "biological-zinc-xerinae.faviconkit.com" },
      { hostname: "www.google.com" },
      { hostname: "flag.vercel.app" },
      { hostname: "flagcdn.com" },
      { hostname: "illustrations.popsy.co" },
      { hostname: "images.prismic.io" },
      { hostname: "api.microlink.io" },
      { hostname: "assets.sandipsarkar.dev" },
      { hostname: "assets.slugy.co" },
      { hostname: "slugy.co" },
      { hostname: "slugylink.github.io" },
      { hostname: "i.postimg.cc" },
    ],
  },

  async redirects() {
    return [
      {
        source: "/onboarding",
        destination: "/onboarding/welcome",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "assets.slugy.co" }],
        destination: "https://assets.sandipsarkar.dev/:path*",
      },
    ];
  },
};

export default nextConfig;
```

Note: the `/pricing` redirect was removed along with the pricing page.

---

### Step 4.4 — Verify build

- [ ] Run:

```bash
npm install
npm run build 2>&1 | tail -30
```

---

### Step 4.5 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: remove Sentry error monitoring

Deletes Sentry config files, instrumentation, example pages, and
unwraps next.config.ts from withSentryConfig. Errors are now only
visible in server logs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Remove Vercel Analytics + Dymo

**Files to delete:**
- `src/lib/dymo.ts`

**Files to modify:**
- `package.json`
- `src/app/layout.tsx`
- `src/app/app/layout.tsx`

---

### Step 5.1 — Delete Dymo

- [ ] Run:

```bash
rm src/lib/dymo.ts
```

---

### Step 5.2 — Remove Vercel + Dymo packages

- [ ] Edit `package.json`, remove from `"dependencies"`:

```json
"@vercel/analytics": "^1.5.0",
"@vercel/functions": "^2.2.0",
"@vercel/speed-insights": "^1.2.0",
"dymo-api": "^1.1.5",
```

---

### Step 5.3 — Remove Analytics and SpeedInsights from root layout

- [ ] Edit `src/app/layout.tsx`:

Remove these two import lines:
```ts
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
```

Remove these two component usages in the JSX:
```tsx
<SpeedInsights />
<Analytics />
```

---

### Step 5.4 — Remove SpeedInsights from app layout

- [ ] Edit `src/app/app/layout.tsx`:

Remove the import:
```ts
import { SpeedInsights } from "@vercel/speed-insights/next";
```

Remove the usage:
```tsx
<SpeedInsights />
```

---

### Step 5.5 — Verify build

- [ ] Run:

```bash
npm install
npm run build 2>&1 | tail -30
```

```bash
# Check for stray dymo/vercel-analytics references
grep -r "dymo\|@vercel/analytics\|@vercel/speed\|SpeedInsights\|@vercel/functions" src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

---

### Step 5.6 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: remove Vercel analytics, speed insights, and Dymo

Removes @vercel/analytics, @vercel/speed-insights, @vercel/functions,
and dymo-api. Layout files cleaned of tracking component imports.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final Cleanup — .env.example + DB Migration

---

### Step 6.1 — Clean up .env.example

- [ ] Edit `.env.example` and remove or comment out these variables:

**Remove (payment / Polar):**
```
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
NEXT_PUBLIC_PRO_YEARLY_PRICE_ID=
NEXT_PUBLIC_PRO_MONTHLY_PRODUCT_ID=
```

**Remove (QStash cron):**
```
QSTASH_URL=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
```

**Remove (dynamic domain binding — Cloudflare Custom Hostnames):**
```
CLOUDFLARE_API_URL=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_FALLBACK_ORIGIN=
```

**Remove (Vercel domain API):**
```
VERCEL_API_URL="https://api.vercel.com";
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=
```

**Remove (Sentry):**
```
SENTRY_AUTH_TOKEN=
```

**Remove (Dymo):**
```
DYMO_API_KEY=
```

**Mark as optional** — add a comment above `DATABASE_REPLICA_URL`:
```
# Optional: Neon read replica. Omit for single-node personal use.
DATABASE_REPLICA_URL=
```

---

### Step 6.2 — Apply Prisma database migration

- [ ] Run the migration (this updates the actual database schema):

```bash
npx prisma migrate dev --name personal-cleanup
```

Expected: Prisma generates a new migration file and applies it. The migration will:
- Drop `plans`, `subscriptions`, `subscription_history` tables
- Drop `usages` table
- Drop `custom_domains` table
- Remove columns from `user`, `workspaces`, `bios`, `links`

If the database has existing data you want to keep in the remaining tables, confirm the migration prompt. If starting fresh, `npx prisma db push` is also fine.

---

### Step 6.3 — Final build check

- [ ] Run a clean install and build:

```bash
npm install
npm run build
```

Expected: Clean build with no errors.

---

### Step 6.4 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: cleanup .env.example and apply personal-cleanup DB migration

Removes all payment/cron/domain/sentry/vercel env vars from example.
Applies Prisma migration to drop Plan, Subscription, Usage, and
CustomDomain tables and remove associated columns.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Post-Completion Verification

- [ ] Run `npm run build` one final time — must be clean
- [ ] Start dev server: `npm run dev`
- [ ] Navigate to `/app` — login should work
- [ ] Create a link — should succeed without any quota error
- [ ] Verify `/settings` loads without billing tab
- [ ] Verify sidebar has no "Domains" or "Billing" items
- [ ] Verify `/pricing` returns 404
- [ ] Check `git log --oneline` shows 6 clean module commits + 1 spec commit

---

## Spec Coverage Check (self-review)

| Spec requirement | Covered in |
|---|---|
| Remove @polar-sh/* + @stripe/stripe-js | Task 1.2 |
| Remove Polar plugin from auth.ts | Task 1.9 |
| Delete polar.ts, subscription store | Task 1.1 |
| Delete Plan/Subscription/SubscriptionHistory models | Task 1.3 |
| Remove billing UI pages | Task 1.1 |
| Remove isPro gates in link/analytics components | Task 1.12–1.14 |
| Remove billing + domains from sidebar nav | Task 1.5 |
| Remove @upstash/qstash | Task 2.2 |
| Delete Usage model + quota Workspace/Bio fields | Task 2.4 |
| Delete cron API routes | Task 2.1 |
| Remove quota guard in link creation | Task 2.5 |
| Delete domain-utils.ts + CustomDomain model | Task 3.1–3.2 |
| Delete domains API + UI pages | Task 3.1 |
| Remove @sentry/nextjs | Task 4.2 |
| Unwrap next.config.ts | Task 4.3 |
| Remove @vercel/analytics + speed-insights + functions | Task 5.2 |
| Delete dymo-api + dymo.ts | Task 5.1–5.2 |
| Clean .env.example | Task 6.1 |
| Prisma DB migration | Task 6.2 |
