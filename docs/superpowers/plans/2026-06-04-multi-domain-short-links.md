# Multi-Domain Short Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each workspace to register custom short-link domains, set a workspace default, and have all link creation, redirect routing, and CSV import/export honour per-domain data.

**Architecture:** A `Domain` DB model stores custom domains per workspace. The existing `proxy.ts` middleware already calls `handleCustomDomainRequest` for unknown hostnames — we restore that function to use the existing `getLink` helper. The link form, CSV route, and Tinybird metadata are updated to use the workspace's effective default domain instead of the hardcoded env var.

**Tech Stack:** Prisma (PostgreSQL), Next.js App Router (Node.js runtime middleware), React, SWR, Zod, Tailwind/shadcn

---

## File Map

| Action        | Path                                                      | Responsibility                                                            |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Modify        | `prisma/schema.prisma`                                    | Add `Domain` model; add `defaultDomain`/`domains` to `Workspace`          |
| Auto-generate | `prisma/migrations/…`                                     | Migration SQL                                                             |
| Modify        | `src/app/api/workspace/[workspaceslug]/domains/route.ts`  | GET / POST / DELETE / PATCH                                               |
| Modify        | `src/lib/middleware/custom-domain.ts`                     | Redirect logic using `getLink`                                            |
| Create        | `src/components/web/_settings/domain-management-card.tsx` | Domain list UI with add/set-default/delete                                |
| Modify        | `src/components/web/_settings/add-domain-dialog.tsx`      | Simplify interface (remove SSL/Cloudflare fields)                         |
| Modify        | `src/app/app/(dashboard)/[workspace]/settings/page.tsx`   | Mount `DomainManagementCard`                                              |
| Modify        | `src/components/web/_links/link-form.tsx`                 | Accept optional `availableDomains` prop                                   |
| Modify        | `src/components/web/_links/create-link.tsx`               | Fetch domains, pass to form, pre-select default                           |
| Modify        | `src/components/web/_links/edit-link.tsx`                 | Fetch domains, pass to form                                               |
| Modify        | `src/app/api/workspace/[workspaceslug]/link/csv/route.ts` | Export: add `domain` col; Import: parse `domain` col, fix `linksToCreate` |
| Modify        | `src/lib/tinybird/slugy-links-metadata.ts`                | Use `link.domain` not env var fallback                                    |

---

## Task 1: Schema Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Auto-generate: `prisma/migrations/`

- [ ] **Step 1: Add `Domain` model and `Workspace` fields to schema**

Open `prisma/schema.prisma`. Find the `Workspace` model (search for `model Workspace`). Add two fields **before** the `@@index` lines at the end of Workspace:

```prisma
  defaultDomain  String?
  domains        Domain[]
```

After the `Workspace` model block and before `model WorkspaceApiKey`, add the new model:

```prisma
model Domain {
  id          String    @id @default(cuid())
  domain      String    @unique
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())

  @@index([workspaceId])
  @@map("domains")
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_domain_model
```

Expected output: `✔ Generated Prisma Client` with a new migration file under `prisma/migrations/`.

- [ ] **Step 3: Verify generated client includes Domain**

```bash
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log(typeof p.domain)"
```

Expected: `object`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Domain model and Workspace.defaultDomain to schema"
```

---

## Task 2: Domains API

**Files:**

- Modify: `src/app/api/workspace/[workspaceslug]/domains/route.ts`

- [ ] **Step 1: Replace the stub with full implementation**

Replace the entire file content:

```typescript
import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { jsonWithETag } from "@/lib/http";
import { headers } from "next/headers";
import { z } from "zod";

const SYSTEM_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Domain is required")
  .refine((v) => !v.startsWith("http"), "Do not include http(s)://")
  .refine((v) => !v.includes("/"), "Do not include paths")
  .refine(
    (v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v),
    "Invalid domain format",
  );

async function getWorkspace(slug: string, userId: string) {
  return db.workspace.findFirst({
    where: { slug, userId, deletedAt: null },
    select: { id: true, defaultDomain: true },
  });
}

// GET /api/workspace/[workspaceslug]/domains
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceslug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return jsonWithETag(req, { error: "Unauthorized" }, { status: 401 });

  const { workspaceslug } = await params;
  const workspace = await getWorkspace(workspaceslug, session.user.id);
  if (!workspace)
    return jsonWithETag(req, { error: "Workspace not found" }, { status: 404 });

  const customDomains = await db.domain.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, domain: true, createdAt: true },
  });

  const effectiveDefault = workspace.defaultDomain || SYSTEM_DOMAIN;

  const domains = [
    {
      id: null,
      domain: SYSTEM_DOMAIN,
      isDefault: effectiveDefault === SYSTEM_DOMAIN,
      isSystem: true,
    },
    ...customDomains.map((d) => ({
      id: d.id,
      domain: d.domain,
      isDefault: d.domain === effectiveDefault,
      isSystem: false,
    })),
  ];

  return jsonWithETag(req, { defaultDomain: effectiveDefault, domains });
}

// POST /api/workspace/[workspaceslug]/domains  { domain: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceslug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return jsonWithETag(req, { error: "Unauthorized" }, { status: 401 });

  const { workspaceslug } = await params;
  const workspace = await getWorkspace(workspaceslug, session.user.id);
  if (!workspace)
    return jsonWithETag(req, { error: "Workspace not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = domainSchema.safeParse(body.domain);
  if (!parsed.success) {
    return jsonWithETag(
      req,
      { error: parsed.error.issues[0]?.message ?? "Invalid domain" },
      { status: 400 },
    );
  }

  const domain = parsed.data;

  if (domain === SYSTEM_DOMAIN) {
    return jsonWithETag(
      req,
      { error: "This domain is already the system default" },
      { status: 409 },
    );
  }

  try {
    const created = await db.domain.create({
      data: { domain, workspaceId: workspace.id },
      select: { id: true, domain: true, createdAt: true },
    });
    return jsonWithETag(
      req,
      { domain: { ...created, isDefault: false, isSystem: false } },
      { status: 201 },
    );
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return jsonWithETag(
        req,
        { error: "Domain already in use" },
        { status: 409 },
      );
    }
    throw e;
  }
}

// DELETE /api/workspace/[workspaceslug]/domains  { domainId: string }
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceslug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return jsonWithETag(req, { error: "Unauthorized" }, { status: 401 });

  const { workspaceslug } = await params;
  const workspace = await getWorkspace(workspaceslug, session.user.id);
  if (!workspace)
    return jsonWithETag(req, { error: "Workspace not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const domainId = z.string().min(1).safeParse(body.domainId);
  if (!domainId.success) {
    return jsonWithETag(req, { error: "domainId required" }, { status: 400 });
  }

  const record = await db.domain.findFirst({
    where: { id: domainId.data, workspaceId: workspace.id },
    select: { id: true, domain: true },
  });
  if (!record)
    return jsonWithETag(req, { error: "Domain not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.domain.delete({ where: { id: record.id } });
    // If deleted domain was the workspace default, reset to null (falls back to system domain)
    if (workspace.defaultDomain === record.domain) {
      await tx.workspace.update({
        where: { id: workspace.id },
        data: { defaultDomain: null },
      });
    }
  });

  return jsonWithETag(req, { success: true });
}

// PATCH /api/workspace/[workspaceslug]/domains  { domainId: string | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceslug: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return jsonWithETag(req, { error: "Unauthorized" }, { status: 401 });

  const { workspaceslug } = await params;
  const workspace = await getWorkspace(workspaceslug, session.user.id);
  if (!workspace)
    return jsonWithETag(req, { error: "Workspace not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // domainId: null → reset to system domain
  if (body.domainId === null) {
    await db.workspace.update({
      where: { id: workspace.id },
      data: { defaultDomain: null },
    });
    return jsonWithETag(req, { defaultDomain: SYSTEM_DOMAIN });
  }

  const domainId = z.string().min(1).safeParse(body.domainId);
  if (!domainId.success) {
    return jsonWithETag(req, { error: "domainId required" }, { status: 400 });
  }

  const record = await db.domain.findFirst({
    where: { id: domainId.data, workspaceId: workspace.id },
    select: { domain: true },
  });
  if (!record)
    return jsonWithETag(req, { error: "Domain not found" }, { status: 404 });

  await db.workspace.update({
    where: { id: workspace.id },
    data: { defaultDomain: record.domain },
  });

  return jsonWithETag(req, { defaultDomain: record.domain });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep "domains/route"
```

Expected: no output (no errors in that file).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workspace/\[workspaceslug\]/domains/route.ts
git commit -m "feat: implement domains API (GET/POST/DELETE/PATCH)"
```

---

## Task 3: Custom Domain Middleware

**Files:**

- Modify: `src/lib/middleware/custom-domain.ts`

- [ ] **Step 1: Implement redirect logic**

Replace the entire file:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { getLink } from "@/lib/middleware/get-link";

export async function handleCustomDomainRequest(
  req: NextRequest,
  hostname: string,
): Promise<NextResponse | null> {
  const slug = req.nextUrl.pathname.slice(1);

  // Only handle single-segment paths (short link slugs)
  if (!slug || slug.includes("/")) return null;

  try {
    const result = await getLink(
      slug,
      req.headers.get("cookie"),
      req.nextUrl.origin,
      hostname,
    );

    if (result.success && result.url) {
      return NextResponse.redirect(new URL(result.url));
    }
  } catch (err) {
    console.error("[custom-domain] getLink error:", err);
  }

  return null; // Fall through → Next.js renders 404
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep "custom-domain"
```

Expected: no output.

- [ ] **Step 3: Manual smoke test**

With dev server running, create a link under the default domain. Then in `custom-domain.ts`, temporarily add a `console.log("custom-domain hit:", hostname, slug)` at the top of the function. Hit `http://localhost:3000/[your-slug]` — confirm the log fires and redirects correctly. Remove the log.

- [ ] **Step 4: Commit**

```bash
git add src/lib/middleware/custom-domain.ts
git commit -m "feat: implement custom domain redirect via getLink"
```

---

## Task 4: Settings UI — Domain Management Card

**Files:**

- Create: `src/components/web/_settings/domain-management-card.tsx`
- Modify: `src/components/web/_settings/add-domain-dialog.tsx`
- Modify: `src/app/app/(dashboard)/[workspace]/settings/page.tsx`

- [ ] **Step 1: Simplify AddDomainDialog interface**

In `src/components/web/_settings/add-domain-dialog.tsx`, replace the `CustomDomain` interface and `AddDomainDialogProps`:

```typescript
// Replace the CustomDomain interface at the top with:
interface DomainRecord {
  id: string;
  domain: string;
  isDefault: boolean;
  isSystem: boolean;
}

interface AddDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceslug: string;
  onDomainAdded: (domain: DomainRecord) => void;
}
```

In `handleSubmit`, change the response handling:

```typescript
// Replace the try block's success path:
const addedDomain: DomainRecord = {
  ...response.data.domain,
  isDefault: false,
  isSystem: false,
};
toast.success("Domain added successfully!");
onDomainAdded(addedDomain);
setDomain("");
// Remove the `needsVerification` / `showSetup` logic entirely
```

- [ ] **Step 2: Create DomainManagementCard component**

Create `src/components/web/_settings/domain-management-card.tsx`:

```typescript
"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Star, Trash2 } from "lucide-react";
import { AddDomainDialog } from "./add-domain-dialog";

interface DomainItem {
  id: string | null;
  domain: string;
  isDefault: boolean;
  isSystem: boolean;
}

interface DomainsResponse {
  defaultDomain: string;
  domains: DomainItem[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function DomainManagementCard({
  workspaceslug,
}: {
  workspaceslug: string;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const { data, mutate } = useSWR<DomainsResponse>(
    `/api/workspace/${workspaceslug}/domains`,
    fetcher,
  );

  const domains = data?.domains ?? [];

  const handleDomainAdded = (domain: DomainItem) => {
    mutate(
      (prev) =>
        prev
          ? { ...prev, domains: [...prev.domains, domain] }
          : { defaultDomain: domain.domain, domains: [domain] },
      false,
    );
    setAddOpen(false);
  };

  const handleSetDefault = async (item: DomainItem) => {
    try {
      await axios.patch(`/api/workspace/${workspaceslug}/domains`, {
        domainId: item.id,
      });
      await mutate();
      toast.success(`Default domain set to ${item.domain}`);
    } catch {
      toast.error("Failed to update default domain");
    }
  };

  const handleDelete = async (item: DomainItem) => {
    if (!confirm(`Delete domain "${item.domain}"? Links using it will still exist in the database.`)) return;
    try {
      await axios.delete(`/api/workspace/${workspaceslug}/domains`, {
        data: { domainId: item.id },
      });
      await mutate();
      toast.success("Domain removed");
    } catch {
      toast.error("Failed to remove domain");
    }
  };

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">
              Short Link Domains
            </CardTitle>
            <CardDescription>
              Domains used for creating short links in this workspace.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {domains.map((item) => (
            <div
              key={item.domain}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{item.domain}</span>
                {item.isSystem && (
                  <Badge variant="secondary" className="text-xs">
                    System
                  </Badge>
                )}
                {item.isDefault && (
                  <Badge className="text-xs">
                    <Star className="mr-1 h-3 w-3" />
                    Default
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!item.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => handleSetDefault(item)}
                  >
                    Set Default
                  </Button>
                )}
                {!item.isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {domains.length === 0 && (
            <p className="text-muted-foreground py-2 text-center text-sm">
              No domains configured.
            </p>
          )}
        </CardContent>
      </Card>

      <AddDomainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        workspaceslug={workspaceslug}
        onDomainAdded={handleDomainAdded}
      />
    </>
  );
}
```

- [ ] **Step 3: Add DomainManagementCard to settings page**

In `src/app/app/(dashboard)/[workspace]/settings/page.tsx`:

Add import at the top (after existing imports):

```typescript
import { DomainManagementCard } from "@/components/web/_settings/domain-management-card";
```

In the returned JSX, add the card after `<WorkspaceSlugForm .../>` and before the danger zone card:

```tsx
<DomainManagementCard workspaceslug={context.workspace} />
```

- [ ] **Step 4: Verify TypeScript**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep -E "domain-management|add-domain|settings/page"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/web/_settings/domain-management-card.tsx \
        src/components/web/_settings/add-domain-dialog.tsx \
        src/app/app/\(dashboard\)/\[workspace\]/settings/page.tsx
git commit -m "feat: add domain management card to workspace settings"
```

---

## Task 5: Link Form — Dynamic Domain Dropdown

**Files:**

- Modify: `src/components/web/_links/link-form.tsx`
- Modify: `src/components/web/_links/create-link.tsx`
- Modify: `src/components/web/_links/edit-link.tsx`

- [ ] **Step 1: Add `availableDomains` prop to LinkFormFields**

In `src/components/web/_links/link-form.tsx`, find the `LinkFormFieldsProps` interface (line ~76) and add one field:

```typescript
interface LinkFormFieldsProps {
  form: UseFormReturn<LinkFormValues>;
  code: string;
  onGenerateRandomSlug: () => void;
  isEditMode?: boolean;
  workspaceslug?: string;
  linkId?: string;
  onSafetyStatusChange?: (status: UrlSafetyStatus) => void;
  draftMetadata?: DraftMetadata;
  onDraftMetadataSave?: (draft: DraftMetadata) => void;
  availableDomains?: DomainOption[]; // ← add this line
}
```

In the `LinkFormFields` function signature (line ~754), destructure the new prop:

```typescript
const LinkFormFields = ({
  form,
  code: _code,
  onGenerateRandomSlug,
  isEditMode = false,
  workspaceslug,
  linkId,
  onSafetyStatusChange,
  draftMetadata,
  onDraftMetadataSave,
  availableDomains: availableDomainsProp,  // ← add this
}: LinkFormFieldsProps) => {
```

Find the internal `availableDomains` computation (line ~820):

```typescript
const availableDomains: DomainOption[] = [
  { value: DEFAULT_DOMAIN, label: DEFAULT_DOMAIN, id: null },
];
```

Replace with:

```typescript
const availableDomains: DomainOption[] =
  availableDomainsProp && availableDomainsProp.length > 0
    ? availableDomainsProp
    : [{ value: DEFAULT_DOMAIN, label: DEFAULT_DOMAIN, id: null }];
```

- [ ] **Step 2: Fetch domains in create-link.tsx and pass to form**

In `src/components/web/_links/create-link.tsx`:

Add import at the top (after existing imports):

```typescript
import useSWR from "swr";
```

Add type inside the component (after existing type definitions at the top of the file, near line 58):

```typescript
interface DomainOption {
  value: string;
  label: string;
  id: string | null;
}

interface DomainsResponse {
  defaultDomain: string;
  domains: Array<{
    id: string | null;
    domain: string;
    isDefault: boolean;
    isSystem: boolean;
  }>;
}
```

Inside the `CreateLinkForm` component function (after the `useForm` call), add:

```typescript
const { data: domainsData } = useSWR<DomainsResponse>(
  workspaceslug ? `/api/workspace/${workspaceslug}/domains` : null,
);

const availableDomains: DomainOption[] = domainsData?.domains.map((d) => ({
  value: d.domain,
  label: d.domain,
  id: d.id,
})) ?? [{ value: DEFAULT_DOMAIN, label: DEFAULT_DOMAIN, id: null }];

// Pre-select workspace default domain when domains load
useEffect(() => {
  if (domainsData?.defaultDomain) {
    setValue("domain", domainsData.defaultDomain);
  }
}, [domainsData?.defaultDomain, setValue]);
```

Add `useEffect` to imports if not already present:

```typescript
import { useState, useCallback, useMemo, useEffect } from "react";
```

Pass `availableDomains` to `LinkFormFields`:

```tsx
<LinkFormFields
  form={form}
  code={code}
  onGenerateRandomSlug={handleGenerateRandomSlug}
  workspaceslug={workspaceslug}
  onSafetyStatusChange={setUrlSafetyStatus}
  draftMetadata={draftMetadata}
  onDraftMetadataSave={(draft) => setDraftMetadata(draft)}
  availableDomains={availableDomains} // ← add this prop
/>
```

- [ ] **Step 3: Fetch domains in edit-link.tsx and pass to form**

In `src/components/web/_links/edit-link.tsx`:

Add import at the top:

```typescript
import useSWR from "swr";
```

Inside the `EditLinkForm` component (after `const { workspaceslug } = useWorkspaceStore()`), add:

```typescript
interface DomainsResponse {
  defaultDomain: string;
  domains: Array<{
    id: string | null;
    domain: string;
    isDefault: boolean;
    isSystem: boolean;
  }>;
}

const { data: domainsData } = useSWR<DomainsResponse>(
  workspaceslug ? `/api/workspace/${workspaceslug}/domains` : null,
);

const availableDomains = domainsData?.domains.map((d) => ({
  value: d.domain,
  label: d.domain,
  id: d.id,
})) ?? [{ value: DEFAULT_DOMAIN, label: DEFAULT_DOMAIN, id: null }];
```

Find the `LinkFormFields` call in edit-link.tsx and add the prop:

```tsx
<LinkFormFields
  form={form}
  code={code}
  onGenerateRandomSlug={handleGenerateRandomSlug}
  isEditMode={true}
  workspaceslug={workspaceslug!}
  linkId={initialData.id}
  onSafetyStatusChange={setUrlSafetyStatus}
  draftMetadata={draftMetadata}
  onDraftMetadataSave={(draft) => setDraftMetadata(draft)}
  availableDomains={availableDomains} // ← add this prop
/>
```

- [ ] **Step 4: Verify TypeScript**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep -E "link-form|create-link|edit-link"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/web/_links/link-form.tsx \
        src/components/web/_links/create-link.tsx \
        src/components/web/_links/edit-link.tsx
git commit -m "feat: dynamic domain dropdown in link form fetched from workspace API"
```

---

## Task 6: CSV Export & Import

**Files:**

- Modify: `src/app/api/workspace/[workspaceslug]/link/csv/route.ts`

- [ ] **Step 1: Add `domain` to CSV export**

In the `columnMap` object (line ~76), add `domain`:

```typescript
const columnMap: Record<string, string> = {
  slug: "slug",
  url: "url",
  domain: "domain", // ← add this line
  clicks: "clicks",
  createdAt: "createdAt",
  link_id: "id",
  updatedAt: "updatedAt",
  tags: "tags",
  archived: "archived",
};
```

Change the default columns to include `domain`:

```typescript
let columns: string[] = ["slug", "url", "domain", "clicks", "createdAt"];
```

- [ ] **Step 2: Fix CSV import — add domain to linksToCreate type**

In the `linksToCreate` array type definition (line ~275), add `domain`:

```typescript
const linksToCreate: Array<{
  slug: string;
  url: string;
  description?: string;
  domain: string; // ← add this line
  workspaceId: string;
  userId: string;
  createdAt: Date;
}> = [];
```

- [ ] **Step 3: Fetch workspace defaultDomain for CSV import**

Find where the workspace is fetched during import (look for `workspaceCheck`). Add `defaultDomain` to its select:

```typescript
// Wherever workspaceCheck.workspace is fetched, ensure defaultDomain is included:
select: {
  id: true,
  slug: true,
  defaultDomain: true,   // ← add this
  // ...existing fields
}
```

- [ ] **Step 4: Parse domain column and build effectiveDomain per row**

In the `records.forEach` loop where `linksToCreate.push(...)` is called (line ~362), add domain resolution:

```typescript
// Add before the linksToCreate.push call:
const rowDomain = (record.domain as string | undefined)?.trim() || "";
const effectiveDomain =
  rowDomain ||
  workspaceCheck.workspace.defaultDomain ||
  process.env.NEXT_PUBLIC_APP_DOMAIN ||
  "slugy.co";

// Validate custom domain if provided
if (
  rowDomain &&
  rowDomain !== (process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co")
) {
  const domainRecord = await db.domain.findFirst({
    where: { domain: rowDomain, workspaceId: workspaceCheck.workspace.id },
    select: { id: true },
  });
  if (!domainRecord) {
    rowErrors.push({
      message: `Domain "${rowDomain}" is not registered to this workspace`,
      path: ["domain"],
    });
  }
}
```

Add `domain: effectiveDomain` to the `linksToCreate.push` call:

```typescript
linksToCreate.push({
  workspaceId: workspaceCheck.workspace.id,
  userId: session.user.id,
  slug,
  url: url.trim(),
  domain: effectiveDomain, // ← add this
  description: descriptionStr,
  createdAt: new Date(),
});
```

**Note:** The domain validation loop above runs per-row inside `records.forEach` which is synchronous. Either make the forEach async or pre-fetch all workspace domains before the loop. Pre-fetch is cleaner:

Before the `records.forEach` loop, add:

```typescript
const workspaceDomains = await db.domain.findMany({
  where: { workspaceId: workspaceCheck.workspace.id },
  select: { domain: true },
});
const validDomains = new Set([
  process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co",
  ...workspaceDomains.map((d) => d.domain),
]);
```

Then inside the loop, replace the `db.domain.findFirst` validation with:

```typescript
if (rowDomain && !validDomains.has(rowDomain)) {
  rowErrors.push({
    message: `Domain "${rowDomain}" is not registered to this workspace`,
    path: ["domain"],
  });
}
```

- [ ] **Step 5: Fix Tinybird domain in CSV import**

Find the `linkMetadata` object (line ~670):

```typescript
const linkMetadata = {
  link_id: linkId,
  domain: process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co",   // ← current
  ...
```

Replace with:

```typescript
const linkMetadata = {
  link_id: linkId,
  domain: originalLink.domain,   // ← use actual link domain
  ...
```

`originalLink` is already referenced in the same block. Confirm `linksToCreate` includes `domain` so `originalLink.domain` is defined.

- [ ] **Step 6: Verify TypeScript**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep "csv/route"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/workspace/\[workspaceslug\]/link/csv/route.ts
git commit -m "feat: CSV export includes domain column; import parses domain with workspace validation"
```

---

## Task 7: Tinybird Metadata Audit

**Files:**

- Modify: `src/lib/tinybird/slugy-links-metadata.ts`

- [ ] **Step 1: Verify slugy-links-metadata.ts already uses link.domain**

```bash
grep -n "domain" src/lib/tinybird/slugy-links-metadata.ts
```

Expected output includes lines like `domain: link.domain ?? ...`. Confirm the fallback is `process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co"` (not just `"slugy.co"`).

If the fallback is only `"slugy.co"` (not checking env var), update:

```typescript
domain: link.domain ?? process.env.NEXT_PUBLIC_APP_DOMAIN ?? "slugy.co",
```

- [ ] **Step 2: Audit all sendLinkMetadata call sites**

```bash
grep -rn "sendLinkMetadata\|updateLink\|domain.*slugy" src/ --include="*.ts" | grep -v ".next"
```

For each result where `domain` is hardcoded to `"slugy.co"` or only uses `NEXT_PUBLIC_APP_DOMAIN` without the actual link domain — update to use the link's `domain` field. The link API routes (`link/route.ts`, `link/[linkId]/update/route.ts`) create links with a `domain` field — confirm Tinybird calls pass that same value.

- [ ] **Step 3: Verify TypeScript clean**

```bash
TMPDIR=~/tmp npx tsc --noEmit 2>&1 | grep -v "^compdef" | grep -v "forgot-password"
```

Expected: no output.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: tinybird metadata uses actual link domain everywhere"
```

---

## Self-Review Checklist

- [x] **Schema**: `Domain` model added, `Workspace.defaultDomain` added — Task 1
- [x] **API GET**: Returns system + custom domains with isDefault/isSystem — Task 2
- [x] **API POST**: Validates domain, creates record, 409 on duplicate — Task 2
- [x] **API DELETE**: Removes domain, resets defaultDomain if needed — Task 2
- [x] **API PATCH**: Sets workspace defaultDomain — Task 2
- [x] **Middleware redirect**: `handleCustomDomainRequest` uses `getLink` — Task 3
- [x] **Settings UI**: `DomainManagementCard` with add/set-default/delete — Task 4
- [x] **Link form**: `availableDomains` prop, fetched from API, default pre-selected — Task 5
- [x] **CSV export**: `domain` column in export — Task 6
- [x] **CSV import**: parses `domain` col, validates against workspace domains, fixes `linksToCreate` — Task 6
- [x] **CSV Tinybird**: uses `originalLink.domain` — Task 6
- [x] **Tinybird audit**: `slugy-links-metadata.ts` fallback corrected — Task 7
