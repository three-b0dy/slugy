# Multi-Domain Short Links — Design Spec

Date: 2026-06-04

## Overview

Enable each workspace to configure multiple custom short-link domains. Links can be created under any domain registered to the workspace. Incoming requests on custom domains are routed to the correct link via the existing middleware. No DNS verification flow — the user controls their own DNS and server.

---

## Scope

- Prisma schema: new `Domain` model + `Workspace.defaultDomain`
- Domains API: GET / POST / DELETE / PATCH (set-default)
- Middleware: `custom-domain.ts` redirect implementation
- Settings UI: domain management card in General settings
- Link form: dynamic domain dropdown with pre-selected default
- CSV export: include `domain` column
- CSV import: parse optional `domain` column; fallback to workspace default
- Tinybird metadata: use actual link `domain` field everywhere

Out of scope: DNS verification, SSL management, Cloudflare integration.

---

## 1. Data Model

### New `Domain` model

```prisma
model Domain {
  id          String    @id @default(cuid())
  domain      String    @unique
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())

  @@map("domains")
}
```

### `Workspace` additions

```prisma
model Workspace {
  // ...existing fields...
  defaultDomain  String?   // null = use NEXT_PUBLIC_APP_DOMAIN env var
  domains        Domain[]
}
```

`defaultDomain` stores the domain string (not a FK) to avoid join overhead on every link creation. When the domain record is deleted and it was the default, `defaultDomain` is reset to `null` by the API.

The `links.domain` field keeps its existing schema default `"slugy.co"` — the application layer always overrides this with the resolved effective default when creating links.

---

## 2. API: `/api/workspace/[workspaceslug]/domains`

### GET

Returns the workspace's domain list. The system domain (`NEXT_PUBLIC_APP_DOMAIN`) is always included as the first entry and is not stored in DB.

**Response:**

```json
{
  "defaultDomain": "go.example.com",
  "domains": [
    {
      "id": null,
      "domain": "example.com",
      "isDefault": false,
      "isSystem": true
    },
    {
      "id": "cld1",
      "domain": "go.example.com",
      "isDefault": true,
      "isSystem": false
    },
    {
      "id": "cld2",
      "domain": "s.mysite.com",
      "isDefault": false,
      "isSystem": false
    }
  ]
}
```

### POST `{ domain: string }`

Adds a custom domain to the workspace.

- Validate: no `http://`, no paths, valid hostname labels (`/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i`)
- Reject if `domain` equals `NEXT_PUBLIC_APP_DOMAIN` (already implicit)
- Reject if `domain` already exists in `domains` table (P2002 / 409)
- Auth: session required, must be workspace owner or admin

**Response:** `{ domain: DomainRecord }`

### DELETE `{ domainId: string }`

Removes a custom domain.

- If the deleted domain was `workspace.defaultDomain`, reset `defaultDomain` to `null`
- Cannot delete the system domain (no DB record for it)

### PATCH `{ domainId: string | null }`

Sets the workspace default domain.

- `domainId: null` → reset to system domain (clears `workspace.defaultDomain`)
- `domainId: "cld1"` → set `workspace.defaultDomain` to that domain's `domain` string
- Verify the domain belongs to this workspace before updating

---

## 3. Middleware — `custom-domain.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLink } from "@/lib/middleware/get-link";

export async function handleCustomDomainRequest(
  req: NextRequest,
  hostname: string,
): Promise<NextResponse | null> {
  const slug = req.nextUrl.pathname.slice(1);
  // Reject empty slugs and paths with sub-segments
  if (!slug || slug.includes("/")) return null;

  const result = await getLink(
    slug,
    req.headers.get("cookie"),
    req.nextUrl.origin,
    hostname,
  );

  if (result.success && result.url) {
    return NextResponse.redirect(new URL(result.url));
  }
  return null; // Fall through to Next.js 404
}
```

`getLink` already handles: Redis cache, password protection, link expiry, analytics tracking. No duplicate logic needed.

**Note:** Verify during implementation that `proxy.ts` (or `middleware.ts`) runs in Node.js runtime, not Edge, since `getLink` uses the `postgres` TCP client.

---

## 4. Settings UI — Domain Management Card

Location: `src/app/app/(dashboard)/[workspace]/settings/page.tsx` — add `DomainManagementCard` after the General workspace settings card.

### Component: `DomainManagementCard`

New file: `src/components/web/_settings/domain-management-card.tsx`

State:

- `domains: DomainItem[]` — fetched from GET `/api/workspace/.../domains`
- `isAddOpen: boolean` — controls `AddDomainDialog`

Simplified `DomainItem` interface (replaces the old complex `CustomDomain`):

```ts
interface DomainItem {
  id: string | null;
  domain: string;
  isDefault: boolean;
  isSystem: boolean;
}
```

Layout:

```
┌─────────────────────────────────────────────┐
│  Short Link Domains               [+ Add]   │
├─────────────────────────────────────────────┤
│  example.com        [System]  [Default ★]  │
│  go.example.com               [Set Default] [Delete] │
│  s.mysite.com                 [Set Default] [Delete] │
└─────────────────────────────────────────────┘
```

- System domain row: no Delete button, badge shows "System"
- Default domain row: badge shows "Default ★", no "Set Default" button
- Non-default custom domains: "Set Default" + "Delete" buttons
- Delete triggers a confirmation before API call; if deleted domain was default, UI resets shown default to system

Reuse existing `AddDomainDialog` with simplified interface (remove SSL/Cloudflare/verification fields). The dialog only needs `domain` input — no verification token flow.

---

## 5. Link Form — Dynamic Domain Dropdown

### Data fetching

In `create-link.tsx` and `edit-link.tsx`, fetch domains on mount:

```ts
const [availableDomains, setAvailableDomains] = useState<DomainOption[]>([
  { value: DEFAULT_DOMAIN, label: DEFAULT_DOMAIN, id: null },
]);

useEffect(() => {
  fetch(`/api/workspace/${workspaceslug}/domains`)
    .then((r) => r.json())
    .then((data) => {
      setAvailableDomains(
        data.domains.map((d) => ({
          value: d.domain,
          label: d.domain,
          id: d.id,
        })),
      );
      // Pre-select default domain
      const def = data.domains.find((d) => d.isDefault) ?? data.domains[0];
      if (def) setValue("domain", def.domain);
    });
}, [workspaceslug]);
```

The form's existing domain `<Select>` already maps `availableDomains` — no JSX changes needed.

---

## 6. CSV Export — Add `domain` Column

Current export columns: `url, slug, description, tags, createdAt`
New export columns: `url, slug, domain, description, tags, createdAt`

The `domain` value comes from the existing `link.domain` field on each record.

---

## 7. CSV Import — Domain Column Support

### Parsing

Read optional `domain` column from each row. If absent or empty, resolve to workspace default:

```ts
const effectiveDomain =
  record.domain?.trim() ||
  workspaceCheck.workspace.defaultDomain ||
  process.env.NEXT_PUBLIC_APP_DOMAIN ||
  "slugy.co";
```

### Validation

If a `domain` value is provided, verify it is either:

- The system domain (`NEXT_PUBLIC_APP_DOMAIN`), or
- A domain in `workspace.domains`

Otherwise reject that row with a validation error: `"Domain not registered to this workspace"`.

### Fix: `linksToCreate` must include `domain`

```ts
linksToCreate.push({
  workspaceId: ...,
  userId: ...,
  slug,
  url: url.trim(),
  domain: effectiveDomain,   // ← was missing, causing schema default "slugy.co"
  description: descriptionStr,
  createdAt: new Date(),
});
```

---

## 8. Tinybird Metadata — Use Actual Link Domain

Every place that sends `linkMetadata` to Tinybird must use the link's actual `domain` field, not `process.env.NEXT_PUBLIC_APP_DOMAIN`.

Files affected:

- `src/app/api/workspace/[workspaceslug]/link/csv/route.ts` — use `originalLink.domain`
- `src/lib/tinybird/slugy-links-metadata.ts` — already uses `link.domain ?? ...`, ensure fallback is `NEXT_PUBLIC_APP_DOMAIN`
- Any other `sendLinkMetadata` call sites — audit and fix

---

## Implementation Order

1. Prisma migration (Domain model + Workspace.defaultDomain)
2. Domains API (GET/POST/DELETE/PATCH)
3. `custom-domain.ts` middleware
4. `DomainManagementCard` + simplified `AddDomainDialog`
5. Settings page — add card
6. Link form — dynamic domain dropdown
7. CSV export — add domain column
8. CSV import — domain column + fix linksToCreate
9. Tinybird audit + fix

---

## Open Questions (to resolve during implementation)

- **Middleware runtime**: Confirm `proxy.ts`/`middleware.ts` runs in Node.js runtime (not Edge) so `getLink` (which uses `postgres` TCP) can be called from `custom-domain.ts`. If Edge, need to replace with a fetch call to an internal API route.
