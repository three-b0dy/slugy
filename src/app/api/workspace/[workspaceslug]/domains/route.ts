import { type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { jsonWithETag } from "@/lib/http";
import { db } from "@/server/db";

const SYSTEM_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Domain is required")
  .refine(
    (v) => !v.startsWith("http://") && !v.startsWith("https://"),
    "Do not include http(s)://",
  )
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
  // domainId: null -> reset to system domain
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
