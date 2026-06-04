import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { setWorkspaceLimitsCache } from "@/lib/cache-utils/workspace-cache";
import { ensureCurrentUsageRecord } from "@/lib/usage/current-usage";
import { db } from "@/server/db";

function checkIngestAuth(req: NextRequest): boolean {
  const secret = process.env.ANALYTICS_INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("Authorization") === `Bearer ${secret}`;
}

const usagesSchema = z.object({
  linkId: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().optional(),
  workspaceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!checkIngestAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validationResult = usagesSchema.safeParse(body);

    if (!validationResult.success) {
      console.error(
        "Analytics validation failed:",
        validationResult.error.flatten(),
      );
      return NextResponse.json(
        {
          error: "Invalid input data",
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { linkId, slug, domain, workspaceId } = validationResult.data;

    const link = await db.link.findFirst({
      where: {
        id: linkId,
        workspaceId,
        slug,
        domain: domain || process.env.NEXT_PUBLIC_APP_DOMAIN || "slugy.co",
      },
      select: { id: true, workspaceId: true },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Link not found or access denied" },
        { status: 404 },
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { maxClicksLimit: true, userId: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: `Workspace not found for workspaceId: ${workspaceId}` },
        { status: 404 },
      );
    }

    const usageRecord = await ensureCurrentUsageRecord(db, {
      workspaceId,
      userId: workspace.userId,
    });

    if (
      workspace.maxClicksLimit != null &&
      usageRecord.clicksTracked >= workspace.maxClicksLimit
    ) {
      return NextResponse.json(
        {
          error: "Click limit reached for this workspace",
          code: "CLICK_LIMIT_REACHED",
        },
        { status: 429 },
      );
    }

    const updatedUsage = await db.$transaction(
      async (tx) => {
        const [linkUpdate, usageUpdate] = await Promise.allSettled([
          tx.link.update({
            where: { id: linkId },
            data: {
              clicks: { increment: 1 },
              lastClicked: new Date(),
            },
          }),
          tx.usage.update({
            where: { id: usageRecord.id },
            data: {
              clicksTracked: { increment: 1 },
            },
            select: { clicksTracked: true },
          }),
        ]);

        if (linkUpdate.status === "rejected") {
          throw new Error(`Failed to update link: ${linkUpdate.reason}`);
        }
        if (usageUpdate.status === "rejected") {
          throw new Error(`Failed to update usage: ${usageUpdate.reason}`);
        }

        return {
          linkUpdate: linkUpdate.value,
          usageUpdate: usageUpdate.value,
        };
      },
      {
        timeout: 5000,
        maxWait: 2000,
      },
    );

    if (
      workspace.maxClicksLimit != null &&
      updatedUsage.usageUpdate.clicksTracked != null
    ) {
      void setWorkspaceLimitsCache(workspaceId, {
        maxClicksLimit: workspace.maxClicksLimit,
        clicksTracked: updatedUsage.usageUpdate.clicksTracked,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Analytics tracked successfully",
    });

    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Analytics tracking error:", error);

    return NextResponse.json(
      { error: "Failed to track analytics" },
      { status: 500 },
    );
  }
}
