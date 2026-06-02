import { getAuthSession } from "@/lib/auth";
import { jsonWithETag } from "@/lib/http";
import { ensureCurrentUsageRecord } from "@/lib/usage/current-usage";
import { db } from "@/server/db";

interface WorkspaceUsageParams {
  params: Promise<{ workspaceslug: string }>;
}

function buildWorkspaceAccessFilter(userId: string) {
  return {
    OR: [
      { userId },
      {
        members: {
          some: { userId },
        },
      },
    ],
  };
}

async function getWorkspaceData(workspaceslug: string, userId: string) {
  return db.workspace.findFirst({
    where: {
      slug: workspaceslug,
      ...buildWorkspaceAccessFilter(userId),
    },
    select: {
      id: true,
      maxClicksLimit: true,
      maxLinksLimit: true,
      maxUsers: true,
    },
  });
}

async function getUsageData(workspaceslug: string, userId: string) {
  const workspace = await db.workspace.findFirst({
    where: {
      slug: workspaceslug,
      ...buildWorkspaceAccessFilter(userId),
    },
    select: { id: true },
  });

  if (!workspace) {
    return null;
  }

  return ensureCurrentUsageRecord(db, {
    workspaceId: workspace.id,
    userId,
  });
}

export async function GET(
  req: Request,
  { params }: WorkspaceUsageParams,
): Promise<Response> {
  try {
    const { workspaceslug } = await params;

    const authResult = await getAuthSession();
    if (!authResult.success) {
      return jsonWithETag(req, { error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.session.user.id;

    const [workspace, usage] = await Promise.all([
      getWorkspaceData(workspaceslug, userId),
      getUsageData(workspaceslug, userId),
    ]);

    if (!workspace) {
      return jsonWithETag(
        req,
        { error: "Workspace not found" },
        { status: 404 },
      );
    }

    return jsonWithETag(req, {
      workspace,
      usage,
      subscription: null,
      isActivePro: false,
    });
  } catch (error) {
    console.error("Failed to fetch usage data:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonWithETag(
      req,
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
